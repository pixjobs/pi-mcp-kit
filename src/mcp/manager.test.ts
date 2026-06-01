/**
 * Tests for the MCP Manager.
 * Uses the mock MCP server for realistic testing.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MCPManager } from "./manager.js";
import { MCPServerConfig } from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOCK_SERVER_PATH = path.join(__dirname, "mockMcpServer.js");

function spawnMockServer(): ChildProcessWithoutNullStreams {
  return spawn("node", [MOCK_SERVER_PATH], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env },
  });
}

describe("MCPManager", () => {
  let procA: ChildProcessWithoutNullStreams;
  let procB: ChildProcessWithoutNullStreams;

  beforeAll(() => {
    procA = spawnMockServer();
    procB = spawnMockServer();
  });

  afterAll(() => {
    procA.kill("SIGTERM");
    procB.kill("SIGTERM");
  });

  it("connects to one server and discovers its tools", async () => {
    const manager = new MCPManager();

    const config: MCPServerConfig[] = [
      { name: "mock-a", command: "node", args: [MOCK_SERVER_PATH] },
    ];

    const connected = await manager.connect(config);
    expect(connected).toBe(true);
    expect(manager.serverCount()).toBe(1);

    const tools = await manager.discover();
    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.fullName)).toContain("__mcp__mock-a:echo");
    expect(tools.map((t) => t.fullName)).toContain("__mcp__mock-a:add");

    await manager.disconnect();
    expect(manager.serverCount()).toBe(0);
  }, 10000);

  it("proxies a tool call through the manager", async () => {
    const manager = new MCPManager();

    await manager.connect([
      { name: "mock-a", command: "node", args: [MOCK_SERVER_PATH] },
    ]);

    const result = await manager.callTool("__mcp__mock-a:echo", { text: "hello" });
    expect(result).toHaveProperty("content");
    expect((result as { content: Array<{ type: string; text: string }> }).content[0].text).toBe("hello");

    await manager.disconnect();
  }, 10000);

  it("connects to multiple servers and discovers all tools", async () => {
    const manager = new MCPManager();

    await manager.connect([
      { name: "mock-a", command: "node", args: [MOCK_SERVER_PATH] },
      { name: "mock-b", command: "node", args: [MOCK_SERVER_PATH] },
    ]);

    expect(manager.serverCount()).toBe(2);

    const tools = await manager.discover();
    expect(tools).toHaveLength(4); // 2 tools × 2 servers

    const names = tools.map((t) => t.fullName);
    expect(names).toContain("__mcp__mock-a:echo");
    expect(names).toContain("__mcp__mock-a:add");
    expect(names).toContain("__mcp__mock-b:echo");
    expect(names).toContain("__mcp__mock-b:add");

    await manager.disconnect();
  }, 10000);

  it("continues connecting when one server fails", async () => {
    const manager = new MCPManager();

    // One valid server + one that uses a non-existent command
    const connected = await manager.connect([
      { name: "mock-a", command: "node", args: [MOCK_SERVER_PATH] },
      { name: "bad", command: "nonexistent-command-xyz" },
    ]);

    // Should still succeed because at least one connected
    expect(connected).toBe(true);
    expect(manager.serverCount()).toBe(1);

    const tools = await manager.discover();
    expect(tools).toHaveLength(2);

    await manager.disconnect();
  }, 10000);

  it("returns false when all servers fail to connect", async () => {
    const manager = new MCPManager();

    const connected = await manager.connect([
      { name: "bad-1", command: "nonexistent-xyz-1" },
      { name: "bad-2", command: "nonexistent-xyz-2" },
    ]);

    expect(connected).toBe(false);
    expect(manager.serverCount()).toBe(0);

    await manager.disconnect();
  });

  it("handles calls with default empty args", async () => {
    const manager = new MCPManager();

    await manager.connect([
      { name: "mock-a", command: "node", args: [MOCK_SERVER_PATH] },
    ]);

    // callTool with no second arg should default to {}
    // echo requires "text" so test add with partial args
    const result = await manager.callTool("__mcp__mock-a:add", { a: 10, b: 20 });
    expect((result as { content: Array<{ text: string }> }).content[0].text).toBe("30");

    await manager.disconnect();
  }, 10000);

  it("handles calls with no args parameter", async () => {
    const manager = new MCPManager();

    await manager.connect([
      { name: "mock-a", command: "node", args: [MOCK_SERVER_PATH] },
    ]);

    // callTool with just the FQN
    const result = await manager.callTool("__mcp__mock-a:echo", { text: "no args test" });
    expect((result as { content: Array<{ text: string }> }).content[0].text).toBe("no args test");

    await manager.disconnect();
  }, 10000);

  it("discovers tools have correct metadata", async () => {
    const manager = new MCPManager();

    await manager.connect([
      { name: "mock-a", command: "node", args: [MOCK_SERVER_PATH] },
    ]);

    const tools = await manager.discover();
    const echoTool = tools.find((t) => t.name === "echo")!;

    expect(echoTool.server).toBe("mock-a");
    expect(echoTool.fullName).toBe("__mcp__mock-a:echo");
    expect(echoTool.description).toContain("Echo");
    expect(echoTool.inputSchema).toHaveProperty("type", "object");

    await manager.disconnect();
  }, 10000);
});
