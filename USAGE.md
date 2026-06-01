# Usage

## Installation

Copy the extension into your agent's extensions directory:

```bash
# OMP
cp -r ~/pi-mcp-kit/dist/* ~/.omp/agent/extensions/pi-mcp-kit/

# Pi
cp -r ~/pi-mcp-kit/dist/* ~/.pi/agent/extensions/pi-mcp-kit/
```

Then place an `mcp.json` as described in `README.md`.

## Configuration

### GitHub server

Requires `@modelcontextprotocol/server-github` and a GitHub personal access token:

```bash
# Install the GitHub server
npx -y @modelcontextprotocol/server-github --help
```

Create `mcp.json` in the extension directory with a `github` server entry. Store the token via the `env` field (see `SECURITY.md`).

### Filesystem server

Grants the MCP server access to a local directory:

```json
{
  "servers": [
    {
      "name": "filesystem",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"]
    }
  ]
}
```

### Multiple servers

Combine any number of MCP servers in the same `mcp.json`. Each server's tools are prefixed by server name to avoid collisions.

## Adding a new server

1. Find the server on npm (search `@modelcontextprotocol/server-*` or the publisher)
2. Note its npm package name
3. Add an entry to `servers` with `command`, `args`, and any required `env`

## Troubleshooting

### No tools discovered

- Check that `mcp.json` is in the correct location
- Verify the server command runs standalone (`npx @modelcontextprotocol/server-... --help`)
- Run `/mcp-status` in the agent for a summary

### Connection fails

- Ensure required dependencies are installed (`npx -y <package>`)
- Check that `env` values are set (tokens, API keys)
- Look at the agent notification for the failure reason

### Tool call fails

- The MCP server may reject the parameters — check its documentation for the expected schema
- Server errors propagate through as `MCP error <code>: <message>`
