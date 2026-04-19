#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import os from "os";

// ─── Config ───────────────────────────────────────────────────────────────────

const DOCS_DIR = process.env.DOCS_DIR
  ? path.resolve(process.env.DOCS_DIR)
  : path.join(os.homedir(), ".claude", "docs");

const MANIFEST_FILE = "claude.md";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function ensureDocsDir() {
  await fs.mkdir(DOCS_DIR, { recursive: true });
}

async function listMarkdownFiles() {
  await ensureDocsDir();
  const entries = await fs.readdir(DOCS_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".md") && e.name !== MANIFEST_FILE)
    .map((e) => e.name);
}

async function readFile(filename) {
  const filepath = path.join(DOCS_DIR, filename);
  // Prevent path traversal
  if (!filepath.startsWith(DOCS_DIR)) {
    throw new Error("Access denied: path outside docs directory");
  }
  return fs.readFile(filepath, "utf-8");
}

async function readManifest() {
  try {
    return await readFile(MANIFEST_FILE);
  } catch {
    return null;
  }
}

/**
 * Simple keyword search: returns matching files with snippets.
 * Scores by number of keyword hits (case-insensitive).
 */
async function searchDocs(query) {
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((k) => k.length > 1);

  if (keywords.length === 0) return [];

  const files = await listMarkdownFiles();
  const results = [];

  for (const filename of files) {
    let content;
    try {
      content = await readFile(filename);
    } catch {
      continue;
    }

    const lower = content.toLowerCase();
    const score = keywords.reduce((acc, kw) => {
      // Count occurrences
      let count = 0;
      let pos = 0;
      while ((pos = lower.indexOf(kw, pos)) !== -1) {
        count++;
        pos += kw.length;
      }
      return acc + count;
    }, 0);

    if (score === 0) continue;

    // Extract up to 3 snippets around first keyword hits
    const snippets = [];
    for (const kw of keywords.slice(0, 2)) {
      const idx = lower.indexOf(kw);
      if (idx === -1) continue;
      const start = Math.max(0, idx - 100);
      const end = Math.min(content.length, idx + 300);
      const snippet = content.slice(start, end).replace(/\n{3,}/g, "\n\n").trim();
      snippets.push(`...${snippet}...`);
    }

    results.push({ filename, score, snippets });
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 10); // top 10
}

// ─── Server ───────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "local-docs",
  version: "1.0.0",
});

// Tool: search_docs
server.tool(
  "search_docs",
  "Search local markdown documentation files by keyword. Returns matching files with relevant snippets.",
  {
    query: z.string().describe("Keywords to search for, e.g. 'react native turbomodule' or 'opensips startup_route'"),
  },
  async ({ query }) => {
    const results = await searchDocs(query);

    if (results.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No results found for: "${query}"\n\nAvailable docs are in ${DOCS_DIR}. Add .md files there and optionally update claude.md with a summary.`,
          },
        ],
      };
    }

    const output = results
      .map(({ filename, score, snippets }) => {
        const snippetText = snippets.length
          ? `\n\nRelevant excerpts:\n${snippets.join("\n\n---\n\n")}`
          : "";
        return `## ${filename} (${score} hit${score !== 1 ? "s" : ""})\n${snippetText}`;
      })
      .join("\n\n═══════════════════════════════\n\n");

    return {
      content: [
        {
          type: "text",
          text: `Search results for: "${query}"\nDocs directory: ${DOCS_DIR}\n\n${output}`,
        },
      ],
    };
  }
);

// Tool: get_doc
server.tool(
  "get_doc",
  "Fetch the full content of a specific documentation file by filename.",
  {
    filename: z.string().describe("Exact filename including .md extension, e.g. 'react-native-turbomodules.md'"),
  },
  async ({ filename }) => {
    // Sanitize: only allow filenames, no path separators
    if (filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
      return {
        content: [{ type: "text", text: "Invalid filename." }],
      };
    }

    try {
      const content = await readFile(filename);
      return {
        content: [
          {
            type: "text",
            text: `# ${filename}\n\n${content}`,
          },
        ],
      };
    } catch {
      return {
        content: [
          {
            type: "text",
            text: `File not found: ${filename}\nDocs directory: ${DOCS_DIR}`,
          },
        ],
      };
    }
  }
);

// Tool: list_docs
server.tool(
  "list_docs",
  "List all available documentation files. Also returns the claude.md manifest summary if it exists.",
  {},
  async () => {
    const files = await listMarkdownFiles();
    const manifest = await readManifest();

    const fileList = files.length
      ? files.map((f) => `- ${f}`).join("\n")
      : "(no .md files found)";

    const manifestSection = manifest
      ? `\n\n## claude.md (manifest)\n\n${manifest}`
      : "\n\n## claude.md\n\n(not found — create ~/.claude/docs/claude.md to describe your docs)";

    return {
      content: [
        {
          type: "text",
          text: `# Local Docs — ${DOCS_DIR}\n\n## Files\n\n${fileList}${manifestSection}`,
        },
      ],
    };
  }
);

// ─── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
