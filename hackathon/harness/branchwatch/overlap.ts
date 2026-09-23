/**
 * Candidate-set overlap between two (run, engine) columns, per scenario. Agent J's hard gate for the BL-35 pairing
 * (semantic-vector vs sqlite-vec1-pure); see branches.md, "The BL-35 pairing".
 *
 *   node branchwatch/overlap.ts <run_a> <engine_a> <run_b> <engine_b> [--manifest-a <path>] [--manifest-b <path>]
 *
 * Compares the top-`limit` sets stored in harness_query_result.returned (each scenario's last error-free iteration).
 * Items are keyed by corpus `ref`: each run's instance manifest (local/pipeline/<notes.instance>/manifest.json) maps
 * that instance's (model, id) to the ref. Ids are per instance, and names can repeat within a model. Items outside the
 * manifest (Metabase built-ins, or runs without a manifest) fall back to model + name, and the fallbacks are counted.
 * Read-only: it only SELECTs from the harness DB.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import pg from "pg";

const REPO = resolve(import.meta.dirname, "../../..");
const DB_URL = process.env.HARNESS_DB_URL ?? "postgres://postgres:postgres@localhost:55432/harness";

type Returned = { id: number; model: string; name: string }[];

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { "manifest-a": { type: "string" }, "manifest-b": { type: "string" } },
});
if (positionals.length !== 4) {
  console.error("usage: overlap.ts <run_a> <engine_a> <run_b> <engine_b> [--manifest-a p] [--manifest-b p]");
  process.exit(2);
}
const [runA, engA, runB, engB] = positionals;

const client = new pg.Client({ connectionString: DB_URL });
await client.connect();

async function manifestFor(runId: string, override?: string): Promise<{ path: string | null; refs: Map<string, string> }> {
  let path = override ?? null;
  if (!path) {
    const { rows } = await client.query<{ notes: string | null }>("select notes from harness_run where run_id = $1", [runId]);
    if (rows.length === 0) throw new Error(`no run ${runId}`);
    const instance = rows[0].notes ? (JSON.parse(rows[0].notes).instance as string | undefined) : undefined;
    const candidate = instance ? resolve(REPO, "local/pipeline", instance, "manifest.json") : null;
    path = candidate && existsSync(candidate) ? candidate : null;
  }
  const refs = new Map<string, string>();
  if (path) {
    const m = JSON.parse(readFileSync(path, "utf8")) as { entities: Record<string, { model: string; id: number }> };
    for (const [ref, e] of Object.entries(m.entities)) refs.set(`${e.model}:${e.id}`, ref);
  }
  return { path, refs };
}

async function sets(runId: string, engine: string, refs: Map<string, string>) {
  const { rows } = await client.query<{ scenario_id: string; returned: Returned | null }>(
    `select distinct on (scenario_id) scenario_id, returned from harness_query_result
     where run_id = $1 and engine = $2 and error is null order by scenario_id, iteration desc`,
    [runId, engine],
  );
  if (rows.length === 0) throw new Error(`no error-free rows for ${runId} / ${engine}`);
  let items = 0;
  let fallback = 0;
  let collisions = 0;
  const out = new Map<string, Set<string>>();
  for (const r of rows) {
    const s = new Set<string>();
    for (const it of r.returned ?? []) {
      items++;
      const ref = refs.get(`${it.model}:${it.id}`);
      if (!ref) fallback++;
      const key = ref ?? `name:${it.model}:${it.name}`;
      if (s.has(key)) collisions++; // only possible for name fallbacks: two same-named items in one result list
      s.add(key);
    }
    out.set(r.scenario_id, s);
  }
  return { out, items, fallback, collisions };
}

try {
  const ma = await manifestFor(runA, values["manifest-a"]);
  const mb = await manifestFor(runB, values["manifest-b"]);
  const a = await sets(runA, engA, ma.refs);
  const b = await sets(runB, engB, mb.refs);
  const scenarios = [...new Set([...a.out.keys(), ...b.out.keys()])].sort();
  let both = 0;
  let union = 0;
  const rows: { scenario: string; nA: number; nB: number; both: number; jaccard: number; onlyA: string[]; onlyB: string[] }[] = [];
  for (const sc of scenarios) {
    const sa = a.out.get(sc) ?? new Set<string>();
    const sb = b.out.get(sc) ?? new Set<string>();
    const inter = [...sa].filter((k) => sb.has(k));
    const u = sa.size + sb.size - inter.length;
    both += inter.length;
    union += u;
    rows.push({
      scenario: sc, nA: sa.size, nB: sb.size, both: inter.length, jaccard: u === 0 ? 1 : inter.length / u,
      onlyA: [...sa].filter((k) => !sb.has(k)), onlyB: [...sb].filter((k) => !sa.has(k)),
    });
  }
  const total = union === 0 ? 1 : both / union;
  console.log(`A: ${runA} / ${engA}  manifest ${ma.path ?? "NONE"}  items ${a.items}, name fallbacks ${a.fallback}, name collisions ${a.collisions}`);
  console.log(`B: ${runB} / ${engB}  manifest ${mb.path ?? "NONE"}  items ${b.items}, name fallbacks ${b.fallback}, name collisions ${b.collisions}`);
  console.log(`scenarios ${scenarios.length}, only in A ${scenarios.filter((s) => !b.out.has(s)).length}, only in B ${scenarios.filter((s) => !a.out.has(s)).length}`);
  for (const r of rows.filter((r) => r.jaccard < 1).sort((x, y) => x.jaccard - y.jaccard)) {
    console.log(`  ${r.scenario.padEnd(22)} ${r.nA}/${r.nB} both ${r.both}  J=${r.jaccard.toFixed(3)}  onlyA=[${r.onlyA.join(", ")}] onlyB=[${r.onlyB.join(", ")}]`);
  }
  console.log(`TOTAL Jaccard ${total.toFixed(3)} (${both}/${union}); scenarios < 1.0: ${rows.filter((r) => r.jaccard < 1).length}`);
  console.log(total >= 0.95 ? "gate: total >= 0.95 (every scenario < 1.0 above still needs an explanation)" : "gate: FAIL (total < 0.95)");
} finally {
  await client.end();
}
