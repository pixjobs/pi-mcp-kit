/**
 * MCP Manager — manages the lifecycle of multiple MCP server connections.
 *
 * Responsibilities:
 * 1. Connect to all configured servers
 * 2. Discover tools from each server
 * 3. Proxy tool calls to the correct server
 *
 * Tool naming: `__mcp__:<server>:<tool>`
 * e.g. `__mcp__filesystem:read_file`, `__mcp__puppeteer:navigate`
 *
 * This FQN format ensures:
 * - Unique names even if two servers have a tool called "read"
 * - Easy parsing to find which server handles a tool
 * - Clear separation between built-in pi tools and MCP tools
 */

import { MCPClient, MCPTool, MCPError } from "./client.js";
import { MCPServerConfig } from "../types.js";

export interface MCPToolInfo {
  server: string;    // server name (e.g. "filesystem")
  name: string;      // tool name (e.g. "read_file")
  fullName: string;  // FQN (e.g. "__mcp__filesystem:read_file")
  description?: string;
  inputSchema: object;
}

/**
 * Manages multiple MCP server connections.
 *
 * Usage:
 * ```ts
 * const manager = new MCPManager();
 * await manager.connect(servers);        // connect to all
 * const tools = await manager.discover(); // discover all tools
 * const result = await manager.callTool("__mcp__filesystem:read_file", { path: "/etc/hosts" });
 * await manager.disconnect();
 * ```
 */
export class MCPManager {
  private clients = new Map<string, MCPClient>();
  private toolToServer = new Map<string, { server: string; name: string }>();

  /**
   * Connect to all configured servers.
   * Servers are connected sequentially — if one fails, others still attempt.
   * Returns true if at least one server connected successfully.
   */
  async connect(servers: MCPServerConfig[]): Promise<boolean> {
    if (servers.length === 0) return false;

    let successCount = 0;

    for (const config of servers) {
      try {
        const client = new MCPClient(config);
        await client.connect();
        this.clients.set(config.name, client);
        successCount++;
      } catch (err) {
        // Log but don't fail — continue trying other servers
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[mcp-manager] Failed to connect to server "${config.name}": ${message}`);
      }
    }

    return successCount > 0;
  }

  /**
   * Discover all tools from all connected servers.
   * Returns a flat list of all tools with their FQN.
   */
  async discover(): Promise<MCPToolInfo[]> {
    const allTools: MCPToolInfo[] = [];

    for (const [name, client] of this.clients) {
      const tools = await client.listTools();
      for (const tool of tools) {
        const fqn = this.buildFQN(name, tool.name);
        const info: MCPToolInfo = {
          server: name,
          name: tool.name,
          fullName: fqn,
          description: tool.description,
          inputSchema: tool.inputSchema,
        };
        allTools.push(info);
        this.toolToServer.set(fqn, { server: name, name: tool.name });
      }
    }

    return allTools;
  }

  /**
   * Call a tool by its FQN.
   * Parses the FQN to find the correct server and tool.
   */
  async callTool(
    fullName: string,
    args: Record<string, unknown> = {}
  ): Promise<object> {
    // Parse: "__mcp__:<server>:<tool>" or "mcp_<server>_<tool>"
    const serverAndTool = this.resolveToolName(fullName);

    const [serverName, toolName] = serverAndTool;

    const client = this.clients.get(serverName);
    if (!client) {
      throw new MCPError(
        `No connected client for server "${serverName}"`,
        "SERVER_NOT_FOUND"
      );
    }

    if (!client.isConnected()) {
      throw new MCPError(
        `Server "${serverName}" is not connected`,
        "SERVER_DISCONNECTED"
      );
    }

    return client.callTool(toolName, args);
  }

  /**
   * Get all discovered tools (metadata only, no inputSchema).
   */
  getTools(): Omit<MCPToolInfo, "inputSchema">[] {
    const tools: Omit<MCPToolInfo, "inputSchema">[] = [];
    for (const [fqn, info] of this.toolToServer) {
      tools.push({
        server: info.server,
        name: info.name,
        fullName: fqn,
      });
    }
    return tools;
  }

  /**
   * Get the number of connected servers.
   */
  serverCount(): number {
    return this.clients.size;
  }

  /**
   * Disconnect all servers and clean up resources.
   */
  async disconnect(): Promise<void> {
    const errors: Error[] = [];

    for (const [name, client] of this.clients) {
      try {
        await client.disconnect();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[mcp-manager] Error disconnecting server "${name}": ${message}`);
        errors.push(new Error(`Failed to disconnect "${name}": ${message}`));
      }
    }

    this.clients.clear();
    this.toolToServer.clear();
  }

  /**
   * Build an FQN from server and tool name.
   */
  private buildFQN(server: string, tool: string): string {
    return `__mcp__${server}:${tool}`;
  }

  /**
   * Resolve a tool name to [server, toolName].
   * Accepts both FQN formats:
   *   - "__mcp__<server>:<tool>" (canonical)
   *   - "mcp_<server>_<tool>" (registration alias)
   */
  private resolveToolName(fullName: string): [string, string] {
    // Try canonical FQN: "__mcp__<server>:<tool>"
    if (fullName.startsWith("__mcp__")) {
      const rest = fullName.slice(7); // skip "__mcp__" (7 chars)
      const colonIndex = rest.indexOf(":");
      if (colonIndex === -1) {
        throw new MCPError(
          `Invalid FQN "${fullName}" — expected "__mcp__<server>:<tool>"`,
          "INVALID_FQN"
        );
      }
      return [rest.slice(0, colonIndex), rest.slice(colonIndex + 1)];
    }

    // Try registration alias: "mcp_<server>_<tool>"
    if (fullName.startsWith("mcp_")) {
      const rest = fullName.slice(4); // skip "mcp_"
      // Split on first underscore: "mcp_<server>_<tool>"
      const underscoreIndex = rest.indexOf("_");
      if (underscoreIndex === -1) {
        throw new MCPError(
          `Invalid tool name "${fullName}" — expected "mcp_<server>_<tool>"`,
          "INVALID_TOOL_NAME"
        );
      }
      return [rest.slice(0, underscoreIndex), rest.slice(underscoreIndex + 1)];
    }

    // Unrecognized format — try to find a matching alias
    if (this.toolToServer.has(fullName)) {
      const info = this.toolToServer.get(fullName)!;
      return [info.server, info.name];
    }

    throw new MCPError(
      `Unknown tool name "${fullName}"`,
      "TOOL_NOT_FOUND"
    );
  }
}
