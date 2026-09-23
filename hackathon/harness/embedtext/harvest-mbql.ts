// Strategy #1, MBQL half: Metabase's own English for a GUI query (lib/describe-query), read from a live instance
// through the MCP v2 `get_content` tool (`query_summary`). Read-only. Needs the corpus applied once (A's
// baseline run with --keep); the summaries are then cached by corpus key, so derived corpora need no instance.
//
//   node harvest-mbql.ts --corpus ../artifacts/sql/corpus.json --manifest <instance>/manifest.json \
//     --user dev@metabase.local --password devdev1234
//
// Writes cache/mbql-describe.json: { source: {url, version, harvestedAt, manifest}, summaries: {corpusKey: text} }.
// Native cards are skipped: for them get_content returns the head of the SQL, not English (sql2text.ts covers them).
import { join } from "node:path";
import { type Corpus, type Manifest, isCardLike, parseArgs, readJson, writeJson, fail } from "../corpus-gen/lib.ts";

const args = parseArgs(process.argv.slice(2));
for (const k of ["corpus", "manifest", "user", "password"]) if (!args[k]) fail(`--${k} is required`);
const corpus = readJson<Corpus>(args.corpus);
const manifest = readJson<Manifest>(args.manifest);
const base = (args.url ?? manifest.metabaseUrl).replace(/\/$/, "");

const session = (await (await fetch(`${base}/api/session`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: args.user, password: args.password }),
})).json() as { id: string }).id;
const version = (await (await fetch(`${base}/api/session/properties`, { headers: { "X-Metabase-Session": session } })).json() as any).version;

let mcpSession = "", rpcId = 0;
async function rpc(method: string, params?: unknown): Promise<any> {
  const res = await fetch(`${base}/api/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json", Accept: "application/json, text/event-stream", "X-Metabase-Session": session,
      ...(mcpSession ? { "Mcp-Session-Id": mcpSession } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", ...(params === undefined && method.startsWith("notifications/") ? {} : { id: ++rpcId }), method, ...(params ? { params } : {}) }),
  });
  mcpSession ||= res.headers.get("mcp-session-id") ?? "";
  const text = await res.text();
  if (!res.ok) fail(`${method} -> ${res.status}: ${text.slice(0, 300)}`);
  const data = text.split("\n").find((l) => l.startsWith("data: "));
  return data ? JSON.parse(data.slice(6)) : text ? JSON.parse(text) : null;
}

await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "harness-embedtext", version: "0" } });
await rpc("notifications/initialized");

const MCP_TYPE: Record<string, string> = { card: "question", dataset: "model", metric: "metric" };
const cards = corpus.entities.filter((e) => isCardLike(e.model) && e.sql === undefined);
const summaries: Record<string, string> = {};
for (let i = 0; i < cards.length; i += 10) {
  const batch = cards.slice(i, i + 10);
  const items = batch.map((e) => ({ type: MCP_TYPE[e.model], id: manifest.entities[e.key]?.id ?? fail(`${e.key} not in manifest`) }));
  const r = await rpc("tools/call", { name: "get_content", arguments: { items } });
  if (r.error || r.result?.isError) fail(`get_content: ${JSON.stringify(r.error ?? r.result).slice(0, 300)}`);
  const results = (r.result.structuredContent ?? JSON.parse(r.result.content[0].text)).results as any[];
  batch.forEach((e, j) => {
    const s = results[j]?.query_summary;
    if (typeof s === "string" && s.trim()) summaries[e.key] = s.trim();
    else console.warn(`  no query_summary for ${e.key}: ${JSON.stringify(results[j]).slice(0, 200)}`);
  });
}

const out = join(import.meta.dirname, "cache", "mbql-describe.json");
writeJson(out, { source: { url: base, version, harvestedAt: new Date().toISOString(), manifest: args.manifest, corpusId: corpus.corpusId }, summaries });
console.log(`${Object.keys(summaries).length}/${cards.length} summaries → ${out}`);
for (const [k, v] of Object.entries(summaries).slice(0, 5)) console.log(`  ${k}: ${v}`);
