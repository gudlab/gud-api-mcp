# Contributing to @gudlab/gud-api-mcp

Internal dev notes. Not shipped in the npm package (`files: ["dist"]`).

## Build & test

```bash
npm install
npm run build      # bundle src/server.ts → dist/server.js (esbuild)
npm test           # vitest — store format, tree ops, masking, core parity
node smoke.mjs     # end-to-end stdio smoke test (spawns the server, runs tools)
```

## Architecture

The server reuses the extension's vscode-free engine. `src/core/` is a **verbatim
mirror** of `products/api-client/src/`:

| File | Source | Notes |
|------|--------|-------|
| `core/models/*` | api-client models | `collection.ts` adds the additive `examples` field |
| `core/services/{httpClient,variableResolver,testRunner,extractionRunner,jsonPath}.ts` | api-client services | identical |
| `core/services/cookieJar.ts` | — | in-memory reimplementation (no VS Code Memento) |

`test/parity.test.ts` diffs the mirrored files against the extension source and
**fails if they drift**. If you change one of those services in the extension,
mirror it here (or the MCP server silently diverges from the extension's request
execution / variable resolution / test semantics).

`src/store.ts` writes the same on-disk format as the extension's
`collectionStore.ts` (slug filenames, canonical key order, `schemaVersion`,
trailing newline) so the extension reads agent output with no conversion — keep
the two serializers in sync.

## Release

1. Bump `version` in `package.json`.
2. `npm run build && npm test`
3. `npm publish --access public` (scoped package needs `--access public`).

npm captures the README at publish time, so a README-only change still needs a
version bump + republish to appear on npmjs.com.
