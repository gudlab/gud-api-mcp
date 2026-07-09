# @gudlab/gud-api-mcp — Gud API for AI agents

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets any
MCP-capable AI agent — **Claude Code, Cursor, Windsurf, Codex, Cline, Zed**, and
others — **create, run, and save API requests and collections** as real Gud API
files your team can open in any VS Code-compatible editor.

When an agent builds an endpoint, it registers the request, runs it, and captures
the response as an example. The collection is written to your project's
`.gud-api/` folder — the same files the [Gud API extension](https://marketplace.visualstudio.com/items?itemName=gudlab.gud-api)
reads. Open your editor and every endpoint the agent built is in your sidebar,
ready to click and re-run. It's git-committable, so it travels with the PR.

Neither Postman nor Bruno occupies this lane: agent-written, editor-native,
git-friendly, no cloud account.

## Works with

- **MCP clients** (this server): Claude Code, Cursor, Windsurf, Codex, Cline, Zed,
  Continue — any tool that speaks the Model Context Protocol.
- **Editors** (the companion Gud API extension that reads the files): VS Code, plus
  any VS Code-compatible editor that installs from
  [Open VSX](https://open-vsx.org/extension/gudlab/gud-api) — Cursor, Windsurf,
  VSCodium, Antigravity, Trae, and more.

The server itself is editor-agnostic — it just writes files. You don't need the
extension to use it, but the extension is what makes the collections clickable.

## Install

The server runs via `npx` — no global install needed. It's the same config for
every MCP client; only the file it lives in differs.

Add this to your client's MCP config (`.mcp.json` for Claude Code, `~/.cursor/mcp.json`
for Cursor, the Windsurf/Codex/Cline equivalent, etc.):

```json
{
  "mcpServers": {
    "gud-api": {
      "command": "npx",
      "args": ["-y", "@gudlab/gud-api-mcp", "--project", "."]
    }
  }
}
```

`--project .` scopes all reads/writes to the current project's `.gud-api/`
folder. Pass an absolute path to target a different project.

## What the agent can do

| Tool | Purpose |
|------|---------|
| `list_collections` | List collections with request counts and folders |
| `get_collection` | Full contents of one collection (bodies + example summaries) |
| `create_collection` | Create a collection in `.gud-api/collections` |
| `upsert_request` | Create/update a request (matched by name), nest under a folder path |
| `send_request` | Execute a request, resolve `{{variables}}`, run tests, optionally capture an example |
| `delete_request` | Remove a saved request |
| `upsert_environment` | Create/update a named variable set (base_url, tokens), optionally set active |
| `get_active_environment` | Read active variables — secret-looking values are masked |

## How it fits the Gud API format

Files are written byte-compatible with the extension (v0.5.7+): slug filenames
(`payments-api.json`), canonical key order, `schemaVersion`, trailing newline.
The MCP server targets **workspace scope** — files live in your project and are
never cloud-synced, so agent output stays local and reviewable.

Captured responses are stored as `examples[]` on each request (max 5). The
extension renders these read-only so you can see exactly what the API returned
when the agent tested it.

## Security notes

- **`send_request` executes arbitrary HTTP** — no more than the `curl` access an
  agent already has, but be aware of it.
- **Secret masking**: `get_active_environment` masks values whose keys look like
  secrets (`token`, `key`, `secret`, `password`, …). `send_request` still resolves
  the real values server-side, so the agent can *use* a credential without
  *reading* it into its context. This is heuristic, not a guarantee — don't put
  production credentials in an agent-visible environment.
- **Cookies are in-memory per session** — an agent never inherits your browser
  session cookies.
- **Writes are confined to `--project`** — collection/environment names are
  slugified, so a name can't traverse out of the `.gud-api/` folder.

## Links

- Docs: <https://gudapi.gudlab.org/docs/ai-agents>
- Gud API extension: [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=gudlab.gud-api) · [Open VSX](https://open-vsx.org/extension/gudlab/gud-api)
- Issues: <https://github.com/gudlab/gud-api/issues>

## License

Proprietary — see the LICENSE file. Free to install and use; redistribution and
modification are restricted.
