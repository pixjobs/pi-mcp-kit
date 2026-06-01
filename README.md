# pi-mcp-kit

A Pi agent extension that bridges [Model Context Protocol](https://modelcontextprotocol.io) (MCP) servers into first-class agent tools.

## What it does

Connects to any MCP server at agent startup, discovers its tools, and registers them with the agent's tool registry under fully qualified names (`__mcp__<server>:<tool>`). Each tool executes through the extension's proxy layer.

## Lifecycle

1. `session_start` → reads `mcp.json` → connects to servers → discovers tools → registers with agent
2. Tool calls are proxied through the manager
3. `session_shutdown` → disconnects all servers

## Configuration

Place an `mcp.json` alongside the extension:

- **OMP:** `~/.omp/agent/extensions/pi-mcp-kit/mcp.json`
- **Pi:** `~/.pi/agent/extensions/pi-mcp-kit/mcp.json`

### Format

```json
{
  "servers": [
    {
      "name": "github",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "your-token-here" }
    }
  ]
}
```

### Fields

| Field | Required | Description |
|---|---|---|
| `name` | Yes | Unique server identifier |
| `command` | Yes | Binary to execute (e.g. `npx`) |
| `args` | No | Argument array |
| `env` | No | Environment variables passed to the child process |

## Example: GitHub server

```json
{
  "servers": [
    {
      "name": "github",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "${GITHUB_TOKEN}" }
    }
  ]
}
```

See `SECURITY.md` for safe token handling.

## Tool registration

Tools are registered with descriptive labels:

```
Get File Contents (MCP: github)
```

The description appends `[via MCP: <server>]`. Output is truncated at 50 KB / 2 000 lines with an info message.

## Commands

| Command | Description |
|---|---|
| `/mcp-status` | Shows connected servers and discovered tools |

## Architecture

```
agent → registerTool("get_file_contents") → execute() → MCPManager.callTool(FQN, args) → MCPClient → MCP stdio
```

- `MCPManager` — multi-server lifecycle, tool proxying
- `MCPClient` — single-server stdio transport wrapper
- `jsonSchemaToTypeBox` — converts MCP JSON schemas to TypeBox for agent validation

## Security

Tokens are stored in `mcp.json` or via `env` fields. See `SECURITY.md`.
