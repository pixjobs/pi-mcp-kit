/**
 * Minimal mock MCP server using Zod schemas (required by MCP SDK McpServer).
 *
 * Usage: node src/mcp/mockMcpServer.js
 * Test manually: node -e 'require("./src/mcp/mockMcpServer.js")'
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

async function main() {
  const server = new McpServer(
    { name: "mock-mcp-server", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.registerTool("echo", {
    description: "Echo back the provided text",
    inputSchema: z.object({
      text: z.string().describe("Text to echo"),
    }),
  }, async ({ text }) => ({
    content: [{ type: "text", text: text ?? "no text" }],
  }));

  server.registerTool("add", {
    description: "Add two numbers",
    inputSchema: z.object({
      a: z.number().describe("First number"),
      b: z.number().describe("Second number"),
    }),
  }, async ({ a, b }) => ({
    content: [{ type: "text", text: String((a ?? 0) + (b ?? 0)) }],
  }));

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Mock server failed:", err);
  process.exit(1);
});

export {};
