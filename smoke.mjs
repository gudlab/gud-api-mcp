// Throwaway MCP stdio smoke test: initialize → tools/list → create_collection
// → upsert_request → get_collection, then print the on-disk file. Run: node smoke.mjs
import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

const project = await fs.mkdtemp(path.join(os.tmpdir(), "gud-mcp-smoke-"));
const child = spawn("node", ["dist/server.js", "--project", project], { stdio: ["pipe", "pipe", "inherit"] });

let buf = "";
const pending = new Map();
child.stdout.on("data", (d) => {
  buf += d.toString();
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

let id = 0;
function rpc(method, params) {
  const myId = ++id;
  return new Promise((resolve) => {
    pending.set(myId, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: myId, method, params }) + "\n");
  });
}
function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

const call = (name, args) => rpc("tools/call", { name, arguments: args });
const text = (r) => r.result?.content?.[0]?.text;

const init = await rpc("initialize", {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "smoke", version: "0" },
});
console.log("1. initialize →", init.result?.serverInfo);
notify("notifications/initialized", {});

const tools = await rpc("tools/list", {});
console.log("2. tools/list →", tools.result.tools.map((t) => t.name).join(", "));

console.log("3. create_collection →", text(await call("create_collection", { name: "Smoke API" })));

console.log(
  "4. upsert_request →",
  text(
    await call("upsert_request", {
      collection: "Smoke API",
      folderPath: ["Users"],
      request: { name: "Get user", method: "GET", url: "{{base_url}}/users/1", bodyType: "none" },
    }),
  ),
);

console.log("5. get_collection →", text(await call("get_collection", { collection: "Smoke API" })));

const file = path.join(project, ".gud-api/collections/smoke-api.json");
console.log("\n6. on-disk file (" + file + "):\n" + (await fs.readFile(file, "utf-8")));

child.kill();
await fs.rm(project, { recursive: true, force: true });
process.exit(0);
