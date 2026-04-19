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
  : path.join(os.homedir(), "docs", "mcp-libs");

const MANIFEST_FILE = "claude.md";

// Known doc categories mirroring the bootup repo list
const KNOWN_REPOS = [
  "opensips", "sipjs", "ejabberd", "rtpengine", "react-native",
  "nodejs", "express", "kubernetes", "helm", "ioredis",
  "jest", "supertest", "nock",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function ensureDocsDir() {
  await fs.mkdir(DOCS_DIR, { recursive: true });
}

function safeRelative(filepath) {
  const rel = path.relative(DOCS_DIR, filepath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Access denied: path outside docs directory");
  }
  return rel;
}

async function readFile(relPath) {
  const filepath = path.join(DOCS_DIR, relPath);
  safeRelative(filepath); // throws on traversal
  return fs.readFile(filepath, "utf-8");
}

async function readManifest() {
  try {
    return await readFile(MANIFEST_FILE);
  } catch {
    return null;
  }
}

/** Recursively collect .md files, returning paths relative to DOCS_DIR. */
async function listMarkdownFiles() {
  await ensureDocsDir();
  const results = [];

  async function walk(dir, relDir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue; // skip .git, hidden dirs/files
      const relPath = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(path.join(dir, entry.name), relPath);
      } else if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== MANIFEST_FILE) {
        results.push(relPath);
      }
    }
  }

  await walk(DOCS_DIR, "");
  return results;
}

/** Group relative file paths by their top-level directory (category). */
function groupByCategory(files) {
  const groups = {};
  for (const f of files) {
    const slash = f.indexOf("/");
    const category = slash !== -1 ? f.slice(0, slash) : "(root)";
    (groups[category] ??= []).push(f);
  }
  return groups;
}

/**
 * Keyword search across all docs. Returns top-10 results with snippets,
 * scored by total keyword hit count.
 */
async function searchDocs(query) {
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((k) => k.length > 1);

  if (keywords.length === 0) return [];

  const files = await listMarkdownFiles();
  const results = [];

  for (const relPath of files) {
    let content;
    try {
      content = await readFile(relPath);
    } catch {
      continue;
    }

    const lower = content.toLowerCase();
    const score = keywords.reduce((acc, kw) => {
      let count = 0;
      let pos = 0;
      while ((pos = lower.indexOf(kw, pos)) !== -1) {
        count++;
        pos += kw.length;
      }
      return acc + count;
    }, 0);

    if (score === 0) continue;

    const snippets = [];
    for (const kw of keywords.slice(0, 2)) {
      const idx = lower.indexOf(kw);
      if (idx === -1) continue;
      const start = Math.max(0, idx - 100);
      const end = Math.min(content.length, idx + 300);
      snippets.push(`...${content.slice(start, end).replace(/\n{3,}/g, "\n\n").trim()}...`);
    }

    const slash = relPath.indexOf("/");
    const category = slash !== -1 ? relPath.slice(0, slash) : "(root)";
    results.push({ relPath, category, score, snippets });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 10);
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
    category: z.string().optional().describe(`Optionally restrict search to one repo folder. Known repos: ${KNOWN_REPOS.join(", ")}`),
  },
  async ({ query, category }) => {
    let results = await searchDocs(query);

    if (category) {
      results = results.filter((r) => r.category === category);
    }

    if (results.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No results found for: "${query}"${category ? ` in category "${category}"` : ""}\n\nDocs directory: ${DOCS_DIR}\nKnown repos: ${KNOWN_REPOS.join(", ")}`,
          },
        ],
      };
    }

    const output = results
      .map(({ relPath, category, score, snippets }) => {
        const snippetText = snippets.length
          ? `\n\nRelevant excerpts:\n${snippets.join("\n\n---\n\n")}`
          : "";
        return `## [${category}] ${relPath} (${score} hit${score !== 1 ? "s" : ""})\n${snippetText}`;
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
  "Fetch the full content of a specific documentation file by its relative path.",
  {
    filename: z.string().describe("Relative path from docs root, e.g. 'opensips/README.md' or 'react-native/turbomodules.md'"),
  },
  async ({ filename }) => {
    // Block absolute paths and traversal; allow subdirectory separators
    if (filename.includes("..") || filename.includes("\\") || path.isAbsolute(filename)) {
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
  "List all available documentation files grouped by repo/category. Also returns the claude.md manifest if it exists.",
  {
    category: z.string().optional().describe(`Filter by a specific repo. Known repos: ${KNOWN_REPOS.join(", ")}`),
  },
  async ({ category } = {}) => {
    const files = await listMarkdownFiles();
    const manifest = await readManifest();

    const groups = groupByCategory(files);
    const categoriesToShow = category
      ? [category]
      : Object.keys(groups).sort();

    const fileList = categoriesToShow
      .filter((cat) => groups[cat])
      .map((cat) => {
        const entries = groups[cat].map((f) => `  - ${f}`).join("\n");
        return `### ${cat}\n${entries}`;
      })
      .join("\n\n");

    const manifestSection = manifest
      ? `\n\n## claude.md (manifest)\n\n${manifest}`
      : `\n\n## claude.md\n\n(not found — create ${path.join(DOCS_DIR, "claude.md")} to describe your docs)`;

    return {
      content: [
        {
          type: "text",
          text: `# Local Docs — ${DOCS_DIR}\n\nKnown repos: ${KNOWN_REPOS.join(", ")}\n\n## Files\n\n${fileList || "(no .md files found)"}${manifestSection}`,
        },
      ],
    };
  }
);

// ─── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
