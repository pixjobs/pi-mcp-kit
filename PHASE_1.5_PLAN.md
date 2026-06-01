# Phase 1.5 Plan: Make pi-mcp-kit Functional

## Goal
Wire the `src/index.ts` extension entry point so pi actually discovers MCP servers, registers their tools with the LLM, and proxies tool calls through the manager.

## Current State (Phase 1 Complete)
- ✅ `src/types.ts` — MCPServerConfig interface
- ✅ `src/config.ts` — Loads & validates mcp.json from `~/.pi/agent/extensions/pi-mcp-kit/mcp.json`
- ✅ `src/mcp/client.ts` — stdio client wrapper (connect/list/call/disconnect)
- ✅ `src/mcp/manager.ts` — Multi-server manager with FQN tool proxying (`__mcp__<server>:<tool>`)
- ✅ `src/mcp/mockMcpServer.js` — Zod-based mock server for tests
- ✅ 31 tests passing, typecheck clean
- ❌ `src/index.ts` — Still scaffolding, not functional

---

## Step 1: JSON Schema → TypeBox Schema Converter

**File:** `src/schema-bridge.ts`

**Why:** MCP tools come with JSON Schema (from the MCP SDK). Pi tools need TypeBox schemas for parameter validation. We need a converter.

**What to build:**
- `jsonSchemaToTypeBox(schema: object): object` — Converts a JSON Schema object to a TypeBox-style schema
- Handle: `object`, `string`, `number`, `integer`, `boolean`, `array`, `enum`
- Map JSON Schema `required` to TypeBox `Type.Required()` 
- Map JSON Schema `additionalProperties: false` to TypeBox behavior
- Map JSON Schema `description` to TypeBox `.meta({ description: ... })` or similar
- Handle nested objects recursively
- Handle arrays with items schemas

**Acceptance criteria:**
- Can convert a simple tool schema like `{ type: "object", properties: { text: { type: "string", description: "..." }, }, required: ["text"], additionalProperties: false }` → TypeBox equivalent
- Handles nested objects
- Handles arrays
- Handles enums
- All existing tests still pass

---

## ✅ Step 1: JSON Schema → TypeBox Schema Converter — COMPLETE

**File:** `src/schema-bridge.ts`
- ✅ Converts MCP JSON Schema → TypeBox for pi tool registration
- ✅ Handles: object, string, number, integer, boolean, array, enum
- ✅ Handles nested objects, arrays with items
- ✅ Graceful degradation for null/undefined/non-object inputs
- ✅ 15 tests passing

## Step 2: Extension Entry Point — Core Wiring

**File:** `src/index.ts` (rewrite)

**What to build:**
- Async factory function that:
  1. Loads config via `loadMCPConfig()`
  2. On `session_start` → connect MCPManager, discover tools
  3. Register each discovered tool via `pi.registerTool()`
  4. On `session_shutdown` → disconnect MCPManager
- Handle partial failures: if some servers fail, still register tools from successful ones

**Acceptance criteria:**
- When a valid mcp.json exists with working servers, tools appear in pi's tool list
- When mcp.json doesn't exist or has errors, pi starts normally (graceful degradation)
- On session shutdown, MCP connections are cleaned up

---

## Step 3: Tool Registration with Proper Schema

**File:** `src/index.ts` (extend Step 2)

**What to build:**
- For each MCP tool discovered by `manager.discover()`:
  - Convert its JSON Schema to TypeBox using Step 1's converter
  - Register with `pi.registerTool()`:
    - `name` → the MCP tool name (short form, e.g., "read_file")
    - `label` → display name (capitalize/space the tool name)
    - `description` → from MCP tool description
    - `promptSnippet` → one-line description for "Available tools" section
    - `parameters` → TypeBox schema from JSON Schema conversion
    - `execute` → proxy to `manager.callTool(fqn, params)`
  - The tool FQN in the MCP manager is `__mcp__<server>:<tool>` — need to resolve it back

**Acceptance criteria:**
- MCP tools show up in the LLM's system prompt
- LLM can call MCP tools and get results
- Tool call arguments are validated against the converted TypeBox schema

---

## ✅ Step 2: Extension Entry Point — Core Wiring — COMPLETE

**File:** `src/index.ts` (rewritten)
- ✅ Async factory function that loads config, connects manager, discovers tools
- ✅ `session_start` → connect MCPManager, discover, register tools
- ✅ `session_shutdown` → disconnect MCPManager
- ✅ `/mcp-status` command shows connected servers and tools
- ✅ Handles partial failures (one server down, others still work)
- ✅ Graceful degradation (no config = normal startup)

## ✅ Step 3: Tool Registration with Proper Schema — COMPLETE

**File:** `src/index.ts` (integrated into Step 2)
- ✅ Each MCP tool registered via `pi.registerTool()` with:
  - TypeBox schema (converted from JSON Schema via Step 1's converter)
  - Proper name, label, description, promptSnippet
  - execute() proxies to `manager.callTool(fqn, args)`
- ✅ Tool call arguments properly typed as `Record<string, unknown>`
- ✅ Results properly formatted with `type: "text"` for pi compatibility

## ✅ Step 4: Output Truncation — COMPLETE

**File:** `src/index.ts` (integrated into execute method)
- ✅ Inline truncation: 50KB / 2000 lines (pi's convention)
- ✅ Formats truncation message with line count, byte sizes, server/tool info
- ✅ Uses string concatenation (avoids template literal corruption)

## ✅ Step 5: `/mcp-status` Command — COMPLETE

**File:** `src/index.ts` (integrated into Step 2)
- ✅ Shows connected servers and tools per server
- ✅ Groups tools by server with human-readable format
- ✅ Handles disconnected state gracefully

---

## Rollback Plan

If at any point we break things:
1. `git checkout -- src/` — revert all changes to src/
2. Run `npm test` and `npm run typecheck` — verify Phase 1 still works
3. The plan document captures every step so we can resume exactly

## ✅ Phase 1.5 COMPLETE

### Summary
| Component | Status | Tests |
|-----------|--------|-------|
| `src/types.ts` | ✅ MCPServerConfig interface | — |
| `src/config.ts` | ✅ Loads & validates mcp.json | 14 |
| `src/schema-bridge.ts` | ✅ JSON Schema → TypeBox converter | 15 |
| `src/mcp/client.ts` | ✅ stdio client wrapper | 9 |
| `src/mcp/manager.ts` | ✅ Multi-server manager | 8 |
| `src/index.ts` | ✅ **Fully functional** extension entry point | 5 (integration) |
| **Total** | **Production-ready** | **51 passing** |

### What's Now Functional
1. **Config loading** — reads `~/.pi/agent/extensions/pi-mcp-kit/mcp.json`
2. **Auto-connect** — on `session_start`, connects all configured servers
3. **Auto-discovery** — discovers all tools from all connected servers
4. **Auto-registration** — registers each MCP tool as a pi tool with proper TypeBox schema
5. **Tool proxying** — MCP tool calls proxy through manager to correct server
6. **Partial failure** — one server down, others still work
7. **Output truncation** — 50KB/2000 lines, pi convention
8. **`/mcp-status` command** — shows connected servers and tools
9. **Cleanup** — on `session_shutdown`, all connections closed

## Rollback Plan
