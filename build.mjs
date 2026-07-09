import * as esbuild from "esbuild";
import { readFileSync } from "fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"));

// Bundle our own source + the mirrored core (which uses extensionless imports)
// into a single ESM file. Third-party packages stay external and resolve from
// node_modules at runtime. esbuild transparently resolves "./foo.js" → foo.ts,
// so the mixed import conventions across our files and the mirrored core just work.
await esbuild.build({
  entryPoints: ["src/server.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  outfile: "dist/server.js",
  packages: "external",
  // Single source of truth for the version — injected from package.json so the
  // MCP server's reported version can never drift from the published package.
  define: { __GUD_MCP_VERSION__: JSON.stringify(pkg.version) },
  banner: {
    // esbuild already hoists the entry file's shebang to the top of the output;
    // we only add a require shim for any external CJS dep that expects it under ESM.
    js: "import { createRequire as _cr } from 'module'; const require = _cr(import.meta.url);",
  },
  logLevel: "info",
});
