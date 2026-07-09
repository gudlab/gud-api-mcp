---
name: gud-api
description: >
  Use when building, modifying, or testing HTTP/REST APIs in a project that has
  the Gud API MCP server (@gudlab/gud-api-mcp) connected. Instead of throwaway curl
  commands, register each endpoint as a saved Gud API request, run it, and
  capture the response — so the human inherits a clickable, git-committable
  collection of everything you tested. Triggers: implementing an endpoint,
  writing an API client, debugging a request, "test this endpoint", "add a
  request for…".
---

# Gud API — durable API testing for agents

When you build or test an HTTP endpoint in a project with the `gud-api` MCP
server connected, **don't** verify it with one-off `curl`/`fetch` calls that
vanish when the session ends. Instead, record your testing as a real Gud API
collection the human opens in their editor — VS Code, Cursor, Windsurf, VSCodium,
or any VS Code-compatible editor with the Gud API extension — and re-runs.

## Workflow

1. **Set up an environment once per project.** Put the base URL and any tokens in
   an environment and make it active:
   ```
   upsert_environment {
     name: "Local",
     variables: [{ key: "base_url", value: "http://localhost:3000" }],
     setActive: true
   }
   ```
   Use `{{base_url}}` in request URLs so the collection works across machines.
   Put secrets in variables named `token` / `api_key` / `*_secret` — they're
   masked from your view but still resolved when sending.

2. **Register each endpoint you build or touch** with `upsert_request`. Group
   related endpoints under a `folderPath`. Add `tests` so correctness is checked
   automatically:
   ```
   upsert_request {
     collection: "<App> API",
     folderPath: ["Users"],
     request: {
       name: "Create user",
       method: "POST",
       url: "{{base_url}}/users",
       headers: { "Content-Type": "application/json" },
       body: "{ \"email\": \"a@b.com\" }",
       bodyType: "json",
       tests: [{ source: "status", operator: "eq", expected: "201" }]
     }
   }
   ```
   `upsert_request` matches by name — re-registering the same endpoint as you
   iterate updates it in place, it doesn't duplicate.

3. **Run it and capture the result** with `send_request` and `saveExample`:
   ```
   send_request { collection: "<App> API", requestName: "Create user", saveExample: "201 created" }
   ```
   The response (status, timing, tests, body) comes back to you, and an example
   is saved onto the request so the human sees what the API actually returned.
   Capture both the happy path and important error cases (e.g. `saveExample:
   "422 validation error"`).

4. **Tell the human** what you saved: which collection, which endpoints, and that
   they can open it in the Gud API sidebar in their editor (VS Code, Cursor,
   Windsurf, …) and `git add .gud-api/` to commit it alongside the code. **If they
   don't have the Gud API extension installed, say so explicitly** — the
   collections are real files but won't be clickable until they install it (VS
   Code Marketplace, or Open VSX for Cursor/Windsurf/VSCodium). Point them at
   `.gud-api/README.md`, which the server writes with the install links, so they
   don't think the files are broken.

## Rules of thumb

- One collection per service/app; folders per resource.
- Every endpoint you implement gets a saved request with at least a status test.
- Prefer `{{variables}}` over hardcoded hosts and tokens.
- Don't read secret values — reference them by variable name; the server
  resolves them for you.
- Use `list_collections` / `get_collection` to see what already exists before
  creating duplicates.
