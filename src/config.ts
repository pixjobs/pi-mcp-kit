/**
 * Loads and validates MCP server configuration.
 *
 * Config file: ~/.pi/agent/extensions/pi-mcp-kit/mcp.json
 *
 * Format:
 * {
 *   "servers": [
 *     { "name": "filesystem", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"] },
 *     { "name": "puppeteer", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-puppeteer"] }
 *   ]
 * }
 */

import fs from "node:fs";
import path from "node:path";
import { MCPServerConfig } from "./types.js";

export interface MCPConfig {
  servers: MCPServerConfig[];
}

export interface MCPConfigError {
  type: "missing" | "parse" | "validation";
  message: string;
}

/**
 * Load the MCP config file.
 * Returns { servers: [] } if the file doesn't exist.
 * Throws on malformed JSON.
 */
export function loadMCPConfig(): MCPConfig | MCPConfigError {
  const configPath = path.join(
    process.env.HOME ?? process.env.USERPROFILE ?? ".",
    ".pi/agent/extensions/pi-mcp-kit/mcp.json"
  );

  if (!fs.existsSync(configPath)) {
    return { servers: [] };
  }

  let raw: unknown;
  try {
    const content = fs.readFileSync(configPath, "utf-8");
    raw = JSON.parse(content);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { type: "parse", message: `Failed to parse mcp.json: ${message}` };
  }

  // Validate structure
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { type: "validation", message: "mcp.json must be a JSON object" };
  }

  const parsed = raw as Record<string, unknown>;
  if (!("servers" in parsed)) {
    return { type: "validation", message: "mcp.json must contain a 'servers' array" };
  }

  if (!Array.isArray(parsed.servers)) {
    return { type: "validation", message: "mcp.json 'servers' must be an array" };
  }

  const servers: MCPServerConfig[] = [];
  for (const server of parsed.servers) {
    if (!server || typeof server !== "object" || Array.isArray(server)) {
      return { type: "validation", message: "Each server must be an object" };
    }

    const s = server as Record<string, unknown>;
    const name = s.name;
    const command = s.command;

    if (typeof name !== "string" || name.length === 0) {
      return { type: "validation", message: "Each server must have a non-empty 'name' string" };
    }
    if (typeof command !== "string" || command.length === 0) {
      return { type: "validation", message: `Server '${name}' must have a non-empty 'command' string` };
    }

    servers.push({
      name,
      command,
      args: Array.isArray(s.args) ? (s.args as string[]) : undefined,
      env: typeof s.env === "object" && !Array.isArray(s.env) ? (s.env as Record<string, string>) : undefined,
    });
  }

  return { servers };
}
