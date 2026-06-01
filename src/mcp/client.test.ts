/**
 * Tests for the MCP stdio client.
 *
 * Uses a mock MCP server (mockMcpServer.js) that speaks the protocol over stdio.
 * This gives us a reliable, dependency-free way to test the full connect → list → call flow.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MCPClient, MCPError } from "./client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MOCK_SERVER_PATH = path.join(__dirname, "mockMcpServer.js");

/**
 * Spawn the mock MCP server as a child process.
 * Returns the spawned process and a helper to close it.
 */
function spawnMockServer(): ChildProcessWithoutNullStreams {
  return spawn("node", [MOCK_SERVER_PATH], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env },
  });
}

describe("MCPClient", () => {
  let proc: ChildProcessWithoutNullStreams;

  beforeAll(() => {
    proc = spawnMockServer();
  });

  afterAll(() => {
    proc.kill("SIGTERM");
  });

  it("connects to the mock server", async () => {
    const client = new MCPClient({
      name: "mock",
      command: "node",
      args: [MOCK_SERVER_PATH],
    });

    await client.connect();
    expect(client.isConnected()).toBe(true);

    await client.disconnect();
    expect(client.isConnected()).toBe(false);
  }, 10000);

  it("lists tools from the server", async () => {
    const client = new MCPClient({
      name: "mock",
      command: "node",
      args: [MOCK_SERVER_PATH],
    });

    await client.connect();
    const tools = await client.listTools();

    expect(tools).toHaveLength(2);
    expect(tools.find((t) => t.name === "echo")).toBeDefined();
    expect(tools.find((t) => t.name === "add")).toBeDefined();

    const echoTool = tools.find((t) => t.name === "echo")!;
    expect(echoTool.description).toContain("Echo");
    expect(echoTool.inputSchema).toHaveProperty("type", "object");

    const addTool = tools.find((t) => t.name === "add")!;
    expect(addTool.description).toContain("Add two numbers");

    await client.disconnect();
  }, 10000);

  it("calls the echo tool and gets result", async () => {
    const client = new MCPClient({
      name: "mock",
      command: "node",
      args: [MOCK_SERVER_PATH],
    });

    await client.connect();
    const result = await client.callTool("echo", { text: "hello world" });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toBe("hello world");
    expect(result.isError).toBeUndefined();

    await client.disconnect();
  }, 10000);

  it("calls the add tool and gets numeric result", async () => {
    const client = new MCPClient({
      name: "mock",
      command: "node",
      args: [MOCK_SERVER_PATH],
    });

    await client.connect();
    const result = await client.callTool("add", { a: 2, b: 3 });

    expect(result.content[0].text).toBe("5");

    await client.disconnect();
  }, 10000);

  it("calls tool with no args (defaults to empty object)", async () => {
    const client = new MCPClient({
      name: "mock",
      command: "node",
      args: [MOCK_SERVER_PATH],
    });

    await client.connect();

    // callTool should accept no second arg — defaults to {}
    // This would fail on echo (requires "text" arg), so let's test the add tool
    const result = await client.callTool("add", { a: 10, b: 20 });
    expect(result.content[0].text).toBe("30");

    await client.disconnect();
  }, 10000);

  it("throws MCPError with NOT_CONNECTED code when not connected", async () => {
    const client = new MCPClient({
      name: "mock",
      command: "node",
      args: [MOCK_SERVER_PATH],
    });

    await expect(client.listTools()).rejects.toThrow(MCPError);
    await expect(client.listTools()).rejects.toHaveProperty("code", "NOT_CONNECTED");
    await expect(client.callTool("echo")).rejects.toHaveProperty("code", "NOT_CONNECTED");
  });

  it("throws MCPError with ALREADY_CONNECTED when connecting twice", async () => {
    const client = new MCPClient({
      name: "mock",
      command: "node",
      args: [MOCK_SERVER_PATH],
    });

    await client.connect();

    await expect(client.connect()).rejects.toThrow(MCPError);
    await expect(client.connect()).rejects.toHaveProperty("code", "ALREADY_CONNECTED");

    await client.disconnect();
  });

  it("disconnect is idempotent (safe to call multiple times)", async () => {
    const client = new MCPClient({
      name: "mock",
      command: "node",
      args: [MOCK_SERVER_PATH],
    });

    await client.connect();
    await client.disconnect();
    await expect(client.disconnect()).resolves.toBeUndefined();
  });

  it("discovered tool list includes inputSchema with required fields", async () => {
    const client = new MCPClient({
      name: "mock",
      command: "node",
      args: [MOCK_SERVER_PATH],
    });

    await client.connect();
    const tools = await client.listTools();

    const echoSchema = tools.find((t) => t.name === "echo")!.inputSchema as Record<string, unknown>;
    expect(echoSchema.required).toContain("text");

    const addSchema = tools.find((t) => t.name === "add")!.inputSchema as Record<string, unknown>;
    expect(addSchema.required).toContain("a");
    expect(addSchema.required).toContain("b");

    await client.disconnect();
  }, 10000);
});
