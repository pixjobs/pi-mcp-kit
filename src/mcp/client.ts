/**
 * MCP stdio client wrapper.
 *
 * Wraps the @modelcontextprotocol/sdk's Client and StdioClientTransport
 * into a simpler interface: connect, list tools, call a tool, disconnect.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StdioClientTransport,
  type StdioServerParameters,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import type { MCPServerConfig } from "../types.js";

/** Tool info returned by a server's listTools call. */
export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: object;
}

/** Result returned by calling a tool. */
export interface MCPToolResult {
  content: Array<{ type: string; [key: string]: unknown }>;
  isError?: boolean;
  [key: string]: unknown;
}

/**
 * Error thrown when MCP operations fail.
 */
export class MCPError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "MCPError";
  }
}

/**
 * Wraps the MCP SDK client with connection lifecycle management.
 *
 * Usage:
 * ```ts
 * const client = new MCPClient(config);
 * await client.connect();
 * const tools = await client.listTools();
 * const result = await client.callTool("read_file", { path: "/etc/hosts" });
 * await client.disconnect();
 * ```
 */
export class MCPClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private connected = false;

  constructor(private config: MCPServerConfig) {}

  /**
   * Establish connection to the MCP server.
   * This spawns the server process and runs the MCP initialization handshake.
   */
  async connect(): Promise<void> {
    if (this.connected) {
      throw new MCPError(
        `Server "${this.config.name}" is already connected`,
        "ALREADY_CONNECTED"
      );
    }

    const transport = new StdioClientTransport({
      command: this.config.command,
      args: this.config.args ?? [],
      env: this.config.env,
    });

    // Listen for transport errors — they should surface as MCPError
    transport.onerror = (error) => {
      console.error(`[mcp:${this.config.name}] transport error:`, error.message);
    };

    transport.onclose = () => {
      console.warn(`[mcp:${this.config.name}] connection closed`);
      this.connected = false;
    };

    this.transport = transport;
    this.client = new Client(
      { name: "pi-mcp-kit", version: "0.1.0" },
      { capabilities: {} }
    );

    try {
      await this.client.connect(transport);
      this.connected = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new MCPError(
        `Failed to connect to server "${this.config.name}": ${message}`,
        "CONNECTION_FAILED",
        err
      );
    }
  }

  /**
   * List all tools provided by the connected server.
   */
  async listTools(): Promise<MCPTool[]> {
    this.assertConnected();
    if (!this.client) throw new MCPError("Client not initialized", "INTERNAL_ERROR");

    try {
      const result = await this.client.listTools();
      return (result.tools ?? []).map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new MCPError(
        `Failed to list tools for server "${this.config.name}": ${message}`,
        "LIST_TOOLS_FAILED",
        err
      );
    }
  }

  /**
   * Call a tool by name with the given arguments.
   */
  async callTool(
    toolName: string,
    args: Record<string, unknown> = {}
  ): Promise<MCPToolResult> {
    this.assertConnected();
    if (!this.client) throw new MCPError("Client not initialized", "INTERNAL_ERROR");

    try {
      const result = await this.client.callTool({ name: toolName, arguments: args });
      return {
        content: (result.content ?? []) as Array<{ type: string; [key: string]: unknown }>,
        isError: result.isError as boolean | undefined,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new MCPError(
        `Failed to call tool "${toolName}" on server "${this.config.name}": ${message}`,
        "TOOL_CALL_FAILED",
        err
      );
    }
  }

  /**
   * Check if this client is connected to a server.
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Close the connection to the server and clean up resources.
   */
  async disconnect(): Promise<void> {
    if (!this.connected) return;

    try {
      if (this.client) {
        await this.client.close();
      }
    } catch (err) {
      console.error(`[mcp:${this.config.name}] error during disconnect:`, err);
    } finally {
      this.connected = false;
      this.client = null;
      this.transport = null;
    }
  }

  private assertConnected(): void {
    if (!this.connected) {
      throw new MCPError(
        `Server "${this.config.name}" is not connected. Call connect() first.`,
        "NOT_CONNECTED"
      );
    }
  }
}
