# Security

## Token storage

Tokens and API keys live in `mcp.json` under each server's `env` field. This file is gitignored and must never be committed.

### Pattern

```json
{
  "servers": [
    {
      "name": "github",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "ghp_xxxxxxxxxxxx" }
    }
  ]
}
```

### Never commit tokens

- `mcp.json` is excluded via `.gitignore`
- `.env` files are excluded
- `*.secret` and `*.pem` are excluded

Before committing, verify no tokens are tracked:

```bash
git grep -l "github_pat_" HEAD~20..HEAD -- .
```

### Minimal permissions

Use the minimum scope required. For a GitHub server that only reads repositories, a fine-grained PAT with read-only `contents` access is sufficient.

### Token refresh

When a token expires, update `mcp.json` and restart the agent. The extension connects on `session_start`, so a new session picks up the updated credentials automatically.
