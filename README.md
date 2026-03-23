# MCP Server Repository

This repository contains a Model Context Protocol (MCP) server built with Cloudflare Workers. The server provides various tools including calculator operations, random number generation, Redis storage, and todo list management.

## Project Structure

- `index.js` - Main entry point for the MCP server
- `my-mcp-server/` - Cloudflare Workers MCP server with TypeScript source code
  - `src/index.ts` - MCP server implementation with tools
  - `package.json` - Dependencies and scripts
  - `wrangler.jsonc` - Cloudflare Workers configuration

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Redis (for todo list and storage features)
- Cloudflare account (for deployment)

## Running the MCP Server Locally

### 1. Start Redis (if needed for storage features)

```bash
cd my-mcp-server
npm run redis:start
```

### 2. Install dependencies

```bash
cd my-mcp-server
npm install
```

### 3. Run the development server

```bash
cd my-mcp-server
npm run dev
```

The server will start on `http://localhost:8787`

## Testing with MCP Inspector

The Model Context Protocol Inspector is a tool for testing and debugging MCP servers.

### Install the inspector

```bash
npm install -g @modelcontextprotocol/inspector
```

### Run the inspector with your server

```bash
npx @modelcontextprotocol/inspector npm run dev
```

This will open the inspector interface where you can:
- View available tools
- Test tool calls
- Debug server responses

## Connecting to OpenCode

OpenCode is an MCP client that can connect to your MCP server. To connect:

1. Open OpenCode settings ~/.config/opencode/opencode.json
2. Navigate to MCP server configuration
3. Add your server with the following configuration:

```json
  "mcp": {
    "your-remote-server": {
      "type": "remote",
      "url": "http://localhost:8787/mcp",
      "enabled": true,
      "headers": {
      }
    }
  }
```

## Using with LSStudio and GLM 4.7

### LSStudio Configuration

LSStudio is an IDE extension that supports MCP servers. To configure it:

1. Open LSStudio settings
2. Find MCP server configuration
3. Add your server connection details

### GLM 4.7 Model Integration

The GLM 4.7 model can use MCP tools through compatible clients. Ensure your MCP client supports GLM 4.7 and has your server configured.

### Example Usage

Once connected, you can use tools like:
- `calculate` - Perform mathematical operations
- `generate_random_number` - Generate random numbers
- `store_value` - Store data in Redis
- `add_new_todo` - Add tasks to your todo list
- `list_all_todos` - View all tasks
- `complete_todo` - Mark tasks as completed

## Available Tools

The MCP server provides the following tools:

1. **add** - Simple addition of two numbers
2. **calculate** - Perform arithmetic operations (add, subtract, multiply, divide)
3. **generate_random_number** - Generate random numbers between a range
4. **store_value** - Store key-value pairs in Redis
5. **add_new_todo** - Add new tasks to the todo list
6. **list_all_todos** - List all tasks in the todo list
7. **complete_todo** - Mark tasks as completed

## Development Scripts

- `npm run dev` - Start development server
- `npm run type-check` - Run TypeScript type checking
- `npm run lint:fix` - Fix linting issues
- `npm run format` - Format code with oxfmt
- `npm run cf-typegen` - Generate Cloudflare types

## Troubleshooting

### Redis Connection Issues

If you encounter Redis connection errors, ensure Redis is running:
```bash
docker ps  # Check if Redis container is running
docker logs redis  # View Redis logs
```

### Inspector Connection Issues

Make sure your MCP server is running and accessible on the specified port. Check the inspector logs for connection errors.
