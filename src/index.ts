/**
 * Pi MCP Kit — Extension entry point.
 *
 * Connects to MCP servers, discovers their tools, and registers them
 * as first-class pi tools for the agent to call.
 *
 * Current status: Phase 1, Step 1.1 — Scaffolding only.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default async function (pi: ExtensionAPI) {
  console.log("pi-mcp-kit loaded (scaffolding)");
}
