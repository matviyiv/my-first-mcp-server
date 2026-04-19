import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import Redis from "ioredis";
import { z } from "zod";



// Define our MCP agent with tools
export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Authless Calculator",
		version: "1.0.0",
	});

	redis = new Redis({
		host: "localhost",
		port: 6379,
	});

	async init() {
		// Simple addition tool
		this.server.tool("add", { a: z.number(), b: z.number() }, async ({ a, b }) => ({
			content: [{ type: "text", text: String(a + b) }],
		}));

		// Calculator tool with multiple operations
		this.server.tool(
			"calculate",
			{
				operation: z.enum(["add", "subtract", "multiply", "divide"]),
				a: z.number(),
				b: z.number(),
			},
			async ({ operation, a, b }) => {
				let result: number;
				switch (operation) {
					case "add":
						result = a + b;
						break;
					case "subtract":
						result = a - b;
						break;
					case "multiply":
						result = a * b;
						break;
					case "divide":
						if (b === 0)
							return {
								content: [
									{
										type: "text",
										text: "Error: Cannot divide by zero",
									},
								],
							};
						result = a / b;
						break;
				}
				return { content: [{ type: "text", text: String(result) }] };
			},
		);

		this.server.tool("generate_random_number", "Generate a truly random number between two numbers", { min: z.number(), max: z.number() }, async ({ min, max }) => {
			try {
				// Fetch true randomness from the drand beacon endpoint   
				const response = await fetch("https://drand.cloudflare.com/public/latest");
				const data = (await response.json()) as { round: number;    signature: string;    previous_signature: string;    randomness: string;   };
				// Process randomness
				const randomHex = data.randomness;
				const startIndex = Math.floor(Math.random() * (randomHex.length - 8));   const randomValue = parseInt(    randomHex.slice(startIndex, startIndex + 8),    16,   );
				// Scale to requested range
				const scaledRandom = (Math.abs(randomValue) % (max - min + 1)) + min;
				console.log('####scaledRandom', scaledRandom);
				return {    content: [     {      type: "text",      text: String(scaledRandom),     },    ],   };
			} catch (error) {
				console.error('!!!Failed', error);
				// Fallback to Math.random if API fails
				return {    content: [     {      type: "text",      text: String(Math.floor(Math.random() * (max - min + 1)) + min),     },    ],   };  } 
			},
		);

		this.server.tool(
			"store_value",
			"Store a simple key-value pair in Redis",
			{
				key: z.string().describe("Key to store the value under"),
				value: z.string().describe("Value to store")
			},
			async ({ key, value }) => {
				try {
					console.log('####Store value', key, value);
					await this.redis.set(key, value);
					console.log('####value stored', key, value);
					return {
						content: [{
							type: "text",
							text: "Value stored successfully"
						}]
					};
				} catch (error: any) {
					throw new Error(`Failed to store value: ${error}`);
				}
			}
		);

		this.server.tool(
		"add_new_todo",
		"Add a new task to your todo list",
		{ task: z.string().describe("Task description") },
		async ({ task }) => {
			await this.redis.set(
			`${task}`,
			JSON.stringify({
				completed: false,
				createdAt: new Date().toISOString(),
			}),
			);
			return { content: [{ type: "text", text: `Added task: ${task}` }] };
		},
		);

		this.server.tool(
		"list_all_todos",
		"List all tasks in your todo list",
		{},
		async () => {
			const list = await this.redis.keys('*');
			const tasks = [];

			for (const key of list) {
			const value = await this.redis.get(key);
			if (value) {
				let taskData;
				try {
				taskData = JSON.parse(value);
				} catch (e) {
				continue;
				}
				tasks.push(`${taskData.completed ? "✅" : "📋"} ${key}`);
			}
			}

			if (tasks.length === 0) {
			return {
				content: [
				{ type: "text", text: "No tasks found. Add some tasks first!" },
				],
			};
			}

			return {
			content: [
				{
				type: "text",
				text: `Todo List:\n${tasks.join("\n")}`,
				},
			],
			};
		},
		);

		this.server.tool(
		"complete_todo",
		"Mark a task as completed",
		{ task: z.string().describe("Task to mark as completed") },
		async ({ task }) => {
			const value = await this.redis.get(task);
			if (!value) {
			return { content: [{ type: "text", text: `Task "${task}" not found` }] };
			}

			let taskData;
			try {
			taskData = JSON.parse(value);
			} catch (e) {
			return { content: [{ type: "text", text: `Invalid task ${task}` }] };
			}

			taskData.completed = true;

			await this.redis.set(task, JSON.stringify(taskData));
			return { content: [{ type: "text", text: `Completed task: ${task}` }] };
		},
		);
	}
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		if (url.pathname === "/mcp") {
			return MyMCP.serve("/mcp").fetch(request, env, ctx);
		}

		return new Response("Not found", { status: 404 });
	},
};
