/**
 * Integration tests for the full MCP tool discovery and registration flow.
 *
 * Tests the chain: config → manager → discover → schema conversion
 * Using the mock MCP server for realistic testing.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MCPManager } from "./mcp/manager.js";
import { jsonSchemaToTypeBox } from "./schema-bridge.js";
import type { MCPServerConfig } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOCK_SERVER_PATH = path.join(__dirname, "mcp/mockMcpServer.js");

function spawnMockServer(): ChildProcessWithoutNullStreams {
  return spawn("node", [MOCK_SERVER_PATH], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env },
  });
}

describe("MCP Integration", () => {
  let proc: ChildProcessWithoutNullStreams;

  beforeAll(() => {
    proc = spawnMockServer();
  });

  afterAll(() => {
    proc.kill("SIGTERM");
  });

  it("discovers tools, converts schemas, and calls tools end-to-end", async () => {
    const manager = new MCPManager();

    // Connect
    const config: MCPServerConfig[] = [
      { name: "int-test", command: "node", args: [MOCK_SERVER_PATH] },
    ];
    const connected = await manager.connect(config);
    expect(connected).toBe(true);
    expect(manager.serverCount()).toBe(1);

    // Discover
    const tools = await manager.discover();
    expect(tools).toHaveLength(2);

    // Verify FQN format
    const echoTool = tools.find((t) => t.name === "echo")!;
    expect(echoTool.fullName).toBe("__mcp__int-test:echo");
    expect(echoTool.server).toBe("int-test");

    // Test schema conversion
    const schema = jsonSchemaToTypeBox(echoTool.inputSchema);
    expect(schema).toBeDefined();

    // Call tool through manager
    const result = await manager.callTool(echoTool.fullName, { text: "hello" });
    expect(result).toHaveProperty("content");
    const content = result as { content: Array<{ type: string; text: string }> };
    expect(content.content[0].type).toBe("text");
    expect(content.content[0].text).toBe("hello");

    await manager.disconnect();
    expect(manager.serverCount()).toBe(0);
  }, 10000);

  it("handles multi-server discovery with schema conversion", async () => {
    const manager = new MCPManager();

    await manager.connect([
      { name: "srv-a", command: "node", args: [MOCK_SERVER_PATH] },
      { name: "srv-b", command: "node", args: [MOCK_SERVER_PATH] },
    ]);
    expect(manager.serverCount()).toBe(2);

    const tools = await manager.discover();
    expect(tools).toHaveLength(4); // 2 tools × 2 servers

    // Verify all have proper FQNs and schemas convert cleanly
    for (const tool of tools) {
      expect(tool.fullName).toMatch(/^__mcp__[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+$/);
      const schema = jsonSchemaToTypeBox(tool.inputSchema);
      expect(schema).toBeDefined();
    }

    // Call tools from both servers
    const resultA = await manager.callTool("__mcp__srv-a:echo", { text: "from A" });
    expect((resultA as { content: Array<{ text: string }> }).content[0].text).toBe("from A");

    const resultB = await manager.callTool("__mcp__srv-b:echo", { text: "from B" });
    expect((resultB as { content: Array<{ text: string }> }).content[0].text).toBe("from B");

    await manager.disconnect();
  }, 10000);

  it("partial failure — one server fails, others still work", async () => {
    const manager = new MCPManager();

    const connected = await manager.connect([
      { name: "good", command: "node", args: [MOCK_SERVER_PATH] },
      { name: "bad", command: "nonexistent-command-xyz-fail" },
    ]);

    expect(connected).toBe(true);
    expect(manager.serverCount()).toBe(1);

    const tools = await manager.discover();
    expect(tools).toHaveLength(2);

    // Can call tools from the good server
    const result = await manager.callTool("__mcp__good:echo", { text: "ok" });
    expect((result as { content: Array<{ text: string }> }).content[0].text).toBe("ok");

    await manager.disconnect();
  }, 10000);

  it("getTools() metadata is correct", async () => {
    const manager = new MCPManager();

    await manager.connect([
      { name: "meta-test", command: "node", args: [MOCK_SERVER_PATH] },
    ]);

    const _tools = await manager.discover();
    const metaTools = manager.getTools();

    expect(metaTools).toHaveLength(2);
    const names = metaTools.map((t) => t.name);
    expect(names).toContain("echo");
    expect(names).toContain("add");

    const servers = metaTools.map((t) => t.server);
    expect(servers).toContain("meta-test");

    await manager.disconnect();
  }, 10000);

  it("converts add tool schema correctly", () => {
    // The add tool has number params
    const addSchema = {
      type: "object",
      properties: {
        a: { type: "number", description: "First number" },
        b: { type: "number", description: "Second number" },
      },
      required: ["a", "b"],
      additionalProperties: false,
    };

    const result = jsonSchemaToTypeBox(addSchema);
    expect(result).toBeDefined();
  });
});
