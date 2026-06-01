/**
 * Tests for the MCP config loader.
 */

import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadMCPConfig } from "./config.js";

// We test by creating a real file in a temp HOME dir
// because the config loader reads from the filesystem.

let originalHome: string | undefined;
let tempHome: string;

beforeEach(() => {
  // Backup original HOME
  originalHome = process.env.HOME;

  // Create a temporary HOME directory
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "pi-mcp-kit-test-"));
  process.env.HOME = tempHome;
});

afterEach(() => {
  // Restore original HOME and clean up temp dir
  if (originalHome !== undefined) {
    process.env.HOME = originalHome;
  } else {
    delete process.env.HOME;
  }

  // Clean up temp directory
  fs.rmSync(tempHome, { recursive: true, force: true });
});

describe("loadMCPConfig", () => {
  it("returns empty servers when config file does not exist", () => {
    const result = loadMCPConfig();
    expect("servers" in result).toBe(true);
    expect((result as { servers: unknown[] }).servers).toEqual([]);
  });

  it("returns empty servers when mcp.json does not exist", () => {
    // Ensure config directory doesn't exist
    const configDir = path.join(tempHome, ".pi", "agent", "extensions", "pi-mcp-kit");
    if (fs.existsSync(configDir)) {
      fs.rmSync(configDir, { recursive: true, force: true });
    }

    const result = loadMCPConfig();
    expect("servers" in result).toBe(true);
    expect((result as { servers: unknown[] }).servers).toEqual([]);
  });

  it("returns a parse error on malformed JSON", () => {
    const configDir = path.join(tempHome, ".pi", "agent", "extensions", "pi-mcp-kit");
    fs.mkdirSync(configDir, { recursive: true });

    // Write malformed JSON
    fs.writeFileSync(path.join(configDir, "mcp.json"), "{ broken json");

    const result = loadMCPConfig();
    expect("type" in result).toBe(true);
    expect((result as { type: string }).type).toBe("parse");
  });

  it("returns a validation error when root is not an object", () => {
    const configDir = path.join(tempHome, ".pi", "agent", "extensions", "pi-mcp-kit");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "mcp.json"), "[1, 2, 3]");

    const result = loadMCPConfig();
    expect("type" in result).toBe(true);
    expect((result as { type: string }).type).toBe("validation");
  });

  it("returns a validation error when 'servers' key is missing", () => {
    const configDir = path.join(tempHome, ".pi", "agent", "extensions", "pi-mcp-kit");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "mcp.json"), JSON.stringify({ foo: "bar" }));

    const result = loadMCPConfig();
    expect("type" in result).toBe(true);
    expect((result as { type: string }).type).toBe("validation");
  });

  it("returns a validation error when 'servers' is not an array", () => {
    const configDir = path.join(tempHome, ".pi", "agent", "extensions", "pi-mcp-kit");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "mcp.json"), JSON.stringify({ servers: "not-an-array" }));

    const result = loadMCPConfig();
    expect("type" in result).toBe(true);
    expect((result as { type: string }).type).toBe("validation");
  });

  it("returns a validation error when a server entry is not an object", () => {
    const configDir = path.join(tempHome, ".pi", "agent", "extensions", "pi-mcp-kit");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "mcp.json"), JSON.stringify({ servers: ["not-an-object"] }));

    const result = loadMCPConfig();
    expect("type" in result).toBe(true);
    expect((result as { type: string }).type).toBe("validation");
  });

  it("returns a validation error when a server is missing name", () => {
    const configDir = path.join(tempHome, ".pi", "agent", "extensions", "pi-mcp-kit");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "mcp.json"), JSON.stringify({ servers: [{ command: "npx" }] }));

    const result = loadMCPConfig();
    expect("type" in result).toBe(true);
    expect((result as { type: string }).type).toBe("validation");
  });

  it("returns a validation error when a server is missing command", () => {
    const configDir = path.join(tempHome, ".pi", "agent", "extensions", "pi-mcp-kit");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "mcp.json"), JSON.stringify({ servers: [{ name: "test" }] }));

    const result = loadMCPConfig();
    expect("type" in result).toBe(true);
    expect((result as { type: string }).type).toBe("validation");
  });

  it("returns a validation error when name is empty", () => {
    const configDir = path.join(tempHome, ".pi", "agent", "extensions", "pi-mcp-kit");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "mcp.json"),
      JSON.stringify({ servers: [{ name: "", command: "npx" }] })
    );

    const result = loadMCPConfig();
    expect("type" in result).toBe(true);
    expect((result as { type: string }).type).toBe("validation");
  });

  it("returns a validation error when command is empty", () => {
    const configDir = path.join(tempHome, ".pi", "agent", "extensions", "pi-mcp-kit");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "mcp.json"),
      JSON.stringify({ servers: [{ name: "test", command: "" }] })
    );

    const result = loadMCPConfig();
    expect("type" in result).toBe(true);
    expect((result as { type: string }).type).toBe("validation");
  });

  it("parses a valid config with multiple servers", () => {
    const configDir = path.join(tempHome, ".pi", "agent", "extensions", "pi-mcp-kit");
    fs.mkdirSync(configDir, { recursive: true });

    const config = {
      servers: [
        {
          name: "filesystem",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/projects"],
        },
        {
          name: "puppeteer",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-puppeteer"],
        },
      ],
    };
    fs.writeFileSync(path.join(configDir, "mcp.json"), JSON.stringify(config));

    const result = loadMCPConfig();
    expect("servers" in result).toBe(true);
    const parsed = result as { servers: { name: string; command: string; args?: string[] }[] };
    expect(parsed.servers).toHaveLength(2);
    expect(parsed.servers[0].name).toBe("filesystem");
    expect(parsed.servers[0].command).toBe("npx");
    expect(parsed.servers[0].args).toEqual(["-y", "@modelcontextprotocol/server-filesystem", "/home/user/projects"]);
    expect(parsed.servers[1].name).toBe("puppeteer");
  });

  it("omits optional fields when not provided", () => {
    const configDir = path.join(tempHome, ".pi", "agent", "extensions", "pi-mcp-kit");
    fs.mkdirSync(configDir, { recursive: true });

    const config = {
      servers: [{ name: "minimal", command: "node", args: ["server.js"] }],
    };
    fs.writeFileSync(path.join(configDir, "mcp.json"), JSON.stringify(config));

    const result = loadMCPConfig();
    expect("servers" in result).toBe(true);
    const parsed = result as { servers: { name: string; command: string }[] };
    expect(parsed.servers[0].name).toBe("minimal");
    expect(parsed.servers[0].command).toBe("node");
  });

  it("parses optional env fields", () => {
    const configDir = path.join(tempHome, ".pi", "agent", "extensions", "pi-mcp-kit");
    fs.mkdirSync(configDir, { recursive: true });

    const config = {
      servers: [
        {
          name: "github",
          command: "npx",
          env: { GITHUB_TOKEN: "abc123" },
        },
      ],
    };
    fs.writeFileSync(path.join(configDir, "mcp.json"), JSON.stringify(config));

    const result = loadMCPConfig();
    expect("servers" in result).toBe(true);
    const parsed = result as { servers: { name: string; command: string; env?: Record<string, string> }[] };
    expect(parsed.servers[0].name).toBe("github");
    expect(parsed.servers[0].env).toEqual({ GITHUB_TOKEN: "abc123" });
  });
});
