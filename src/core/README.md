# src/core — mirrored from the extension

These files are **copied verbatim** from `products/api-client/src/` and share
no build with it (the MCP server ships as a standalone npm package,
`@gudlab/gud-api-mcp`). They are the vscode-free heart of Gud API:

| File | Source | Notes |
|------|--------|-------|
| `models/request.ts` | api-client/src/models/request.ts | identical |
| `models/environment.ts` | api-client/src/models/environment.ts | identical |
| `models/collection.ts` | api-client/src/models/collection.ts | + additive `ExampleResponse` / `examples` field |
| `services/variableResolver.ts` | api-client/src/services/variableResolver.ts | identical |
| `services/testRunner.ts` | api-client/src/services/testRunner.ts | identical |
| `services/extractionRunner.ts` | api-client/src/services/extractionRunner.ts | identical |
| `services/jsonPath.ts` | api-client/src/services/jsonPath.ts | identical |
| `services/httpClient.ts` | api-client/src/services/httpClient.ts | identical (imports the local in-memory cookieJar) |
| `services/cookieJar.ts` | — | **in-memory reimplementation** (no VS Code Memento) |

These modules have zero churn in the extension. A future refactor may extract
them into a shared `@gudlab/core` package consumed by both; until then, if you
change one of these in the extension, mirror the change here. `test/parity.test.ts`
guards against silent drift by diffing the mirrored files against their sources.
