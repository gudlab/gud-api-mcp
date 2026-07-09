# src/core — the vscode-free engine

These modules are the editor-independent heart of Gud API: the HTTP request
engine, variable resolution, test and extraction runners, JSON path lookup, and
the shared data models. They carry no VS Code dependency, which lets the MCP
server ship as a standalone npm package (`@gudlab/gud-api-mcp`) that reuses the
exact same request-execution and variable semantics as the Gud API extension.

| File | Notes |
|------|-------|
| `models/request.ts` | request/auth/body data model |
| `models/environment.ts` | environment + variables data model |
| `models/collection.ts` | collection model (with `ExampleResponse` / `examples`) |
| `services/variableResolver.ts` | `{{variable}}` resolution |
| `services/testRunner.ts` | assertion/test evaluation |
| `services/extractionRunner.ts` | response value extraction |
| `services/jsonPath.ts` | dotted/indexed JSON path lookup |
| `services/httpClient.ts` | request execution (uses the local in-memory cookie jar) |
| `services/cookieJar.ts` | in-memory cookie jar (no persistent store) |

These modules share their behaviour with the Gud API editor extension and are
kept in lockstep with it, so a request built by an agent runs identically when a
human opens it in the extension.
