/**
 * Pi MCP Kit — Extension entry point.
 *
 * Connects to MCP servers, discovers their tools, and registers them
 * as first-class pi tools for the agent to call.
 *
 * Lifecycle:
 *   session_start → load config → connect managers → discover tools → register tools
 *   session_shutdown → disconnect managers → clean up
 *
 * Config file: ~/.pi/agent/extensions/pi-mcp-kit/mcp.json
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadMCPConfig } from "./config.js";
import { MCPManager } from "./mcp/manager.js";
import { jsonSchemaToTypeBox } from "./schema-bridge.js";
import type { MCPServerConfig } from "./types.js";

// ─── Helper functions ───────────────────────────────────────────────────────

/** Format bytes to human-readable string (e.g. "50KB"). */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/** Return the kept line count (either sliced or total). */
function keptLinesCount(totalLines: number, maxLines: number, rawText: string): number {
  if (totalLines > maxLines) return maxLines;
  let byteLen = 0;
  let count = 0;
  for (const line of rawText.split("\n")) {
    byteLen += Buffer.byteLength(line, "utf-8");
    if (byteLen > 50 * 1024) break;
    count++;
  }
  return count;
}

// ─── Extension State ────────────────────────────────────────────────────────

/** Tracks which MCP server and tool each pi tool belongs to. */
interface ToolRoute {
  server: string;
  tool: string;
}

// ─── Factory ────────────────────────────────────────────────────────────────

export default async function (pi: ExtensionAPI) {
  const manager = new MCPManager();
  const toolRoutes = new Map<string, ToolRoute>(); // pi tool name -> { server, tool }

  // ── Lifecycle: session_start ──────────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    // Load config
    const config = loadMCPConfig();
    if ("type" in config && config.type === "parse") {
      ctx.ui.notify(`mcp-kit: failed to parse mcp.json: ${config.message}`, "error");
      return;
    }
    if ("type" in config && config.type === "validation") {
      ctx.ui.notify(`mcp-kit: invalid mcp.json: ${config.message}`, "error");
      return;
    }

    const servers = (config as { servers: MCPServerConfig[] }).servers;
    if (servers.length === 0) {
      ctx.ui.notify("mcp-kit: no MCP servers configured (empty mcp.json)", "info");
      return;
    }

    // Connect to all servers
    const connected = await manager.connect(servers);
    if (!connected) {
      ctx.ui.notify("mcp-kit: failed to connect to any MCP server", "error");
      return;
    }

    ctx.ui.notify(
      `mcp-kit: connected to ${manager.serverCount()} server(s)`,
      "info"
    );

    // Discover tools from all connected servers
    const discovered = await manager.discover();
    if (discovered.length === 0) {
      ctx.ui.notify("mcp-kit: no tools discovered from connected servers", "warning");
      return;
    }

    // Register each tool with pi
    let registeredCount = 0;
    for (const tool of discovered) {
      try {
        // Convert MCP JSON Schema -> TypeBox
        const typeBoxSchema = jsonSchemaToTypeBox(tool.inputSchema);

        // Build a human-friendly label from the tool name
        const label = tool.name
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());

        // Register the tool
        pi.registerTool({
          name: tool.name,
          label: `${label} (MCP: ${tool.server})`,
          description: tool.description
            ? `${tool.description} [via MCP: ${tool.server}]`
            : `[MCP: ${tool.server}] ${tool.name}`,
          promptSnippet: tool.name.replace(/_/g, " "),
          parameters: typeBoxSchema,
          async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
            try {
              // Proxy the call through the manager
              const args = (params ?? {}) as Record<string, unknown>;
              const result = await manager.callTool(tool.fullName, args);
              const content = (result as { content?: Array<{ type: string; [key: string]: unknown }> })?.content ?? [];

              // Convert content items to text
              const textItems: string[] = [];
              for (const item of content) {
                if (item.type === "text" && "text" in item && typeof item.text === "string") {
                  textItems.push(item.text);
                } else {
                  textItems.push(JSON.stringify(item));
                }
              }

              const rawText = textItems.join("\n");

              // Truncate output to pi's convention: 50KB / 2000 lines
              const MAX_BYTES = 50 * 1024;
              const MAX_LINES = 2000;
              const totalLines = rawText.split("\n");
              let truncated = false;
              let kept = totalLines.length;
              let finalText = rawText;

              if (totalLines.length > MAX_LINES) {
                truncated = true;
                kept = MAX_LINES;
                finalText = totalLines.slice(0, MAX_LINES).join("\n");
              } else if (Buffer.byteLength(rawText, "utf-8") > MAX_BYTES) {
                truncated = true;
                // Truncate to byte limit
                let byteLen = 0;
                const sliced: string[] = [];
                for (const line of totalLines) {
                  const lineLen = Buffer.byteLength(line, "utf-8");
                  if (byteLen + lineLen > MAX_BYTES) break;
                  byteLen += lineLen;
                  sliced.push(line);
                }
                kept = sliced.length;
                finalText = sliced.join("\n");
              }

              const truncMsg = truncated
                ? "\n\n[Output truncated: " + totalLines.length + " lines (kept " + kept + "); "
                  + formatSize(Buffer.byteLength(rawText)) + " (kept " + formatSize(Buffer.byteLength(finalText)) + "). MCP tool: "
                  + tool.name + " (server: " + tool.server + ")]"
                : "";
              const formattedText = finalText + truncMsg;

              return {
                content: [{ type: "text" as const, text: formattedText }],
                details: {
                  source: "mcp",
                  server: tool.server,
                  tool: tool.name,
                },
              };
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              throw new Error("MCP tool call failed (" + tool.server + ":" + tool.name + "): " + message);
            }
          },
        });

        toolRoutes.set(tool.name, { server: tool.server, tool: tool.name });
        registeredCount++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[mcp-kit] failed to register tool "${tool.name}" from "${tool.server}": ${message}`);
      }
    }

    ctx.ui.notify(
      `mcp-kit: registered ${registeredCount} tool(s) from ${manager.serverCount()} server(s)`,
      "info"
    );
  });

  // ── Lifecycle: session_shutdown ───────────────────────────────────────────

  pi.on("session_shutdown", async (event, ctx) => {
    try {
      await manager.disconnect();
      ctx.ui.notify(`mcp-kit: disconnected from ${manager.serverCount()} server(s)`, "info");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[mcp-kit] error during disconnect: ${message}`);
    }
  });

  // ── Status command ────────────────────────────────────────────────────────

  pi.registerCommand("mcp-status", {
    description: "Show MCP server and tool status",
    handler: async (_args, ctx) => {
      const serverCount = manager.serverCount();
      if (serverCount === 0) {
        ctx.ui.notify("mcp-kit: no servers connected", "info");
        return;
      }

      const tools = manager.getTools();
      if (tools.length === 0) {
        ctx.ui.notify(`mcp-kit: ${serverCount} server(s) connected, 0 tools discovered`, "info");
        return;
      }

      // Group tools by server
      const byServer = new Map<string, string[]>();
      for (const tool of tools) {
        const list = byServer.get(tool.server) ?? [];
        list.push(tool.name);
        byServer.set(tool.server, list);
      }

      const lines: string[] = [];
      lines.push(`MCP Status: ${serverCount} server(s), ${tools.length} tool(s)`);
      lines.push("");
      for (const [server, toolNames] of byServer) {
        lines.push(`  [${server}] ${toolNames.join(", ")}`);
      }

      ctx.ui.setWidget("mcp-status", lines);
      ctx.ui.notify("mcp-kit: status shown in widget", "info");
    },
  });

  // ── Expose route info for other extensions ────────────────────────────────

  pi.events.on("pi-mcp-kit:tool-route", (_data: unknown) => {
    const toolName = typeof _data === "string" ? _data : "";
    const route = toolRoutes.get(toolName);
    if (route) {
      return route;
    }
  });

  // Cleanup on process exit
  process.on("exit", async () => {
    await manager.disconnect();
  });
}
