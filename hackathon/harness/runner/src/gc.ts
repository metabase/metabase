/**
 * List pipeline leftovers (BL-29): the mb_pl_<name> / wh_pl_<name> databases and local/pipeline/<name>/ dirs that no
 * live instance uses any more. Read-only: it prints the drop commands for a human to run, and never runs them.
 *
 *   node src/gc.ts
 *
 * An instance is stale only when all of these hold:
 *   - no connection to either of its databases (a running JVM holds pool connections to mb_pl_<name>);
 *   - no `keep` marker in its dir (written by pipeline.ts --keep);
 *   - its metabase.log wasn't modified in the last 10 minutes (covers a job still booting, before its pool connects);
 *   - no running queue job logged it as its instance.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

import pg from "pg";

import { isMain } from "./config.ts";

const RUNNER = resolve(import.meta.dirname, "..");
const REPO = resolve(RUNNER, "../../..");
const PIPELINE_DIRS = resolve(REPO, "local/pipeline");
const QUEUE_LOGS = resolve(process.env.HARNESS_QUEUE_DIR ?? resolve(RUNNER, "queue"), "logs");
const PG_URL = "postgres://postgres:postgres@localhost:55432/postgres";
const RECENT_MS = 10 * 60_000;

type Instance = {
  name: string;
  dbs: { name: string; bytes: number; connections: number }[];
  dir: string | null;
  logAgeMin: number | null;
  stale: boolean;
  reasons: string[];
};

/** Instance names of the queue's running jobs, from each job log's first "instance <name>:" line. */
function runningQueueInstances(): Set<string> {
  const names = new Set<string>();
  let status = "";
  try {
    status = execFileSync(process.execPath, ["src/queue.ts", "status"], { cwd: RUNNER, encoding: "utf8" });
  } catch {
    return names;
  }
  for (const [, id] of status.matchAll(/^running\s+(\S+)/gm)) {
    const log = resolve(QUEUE_LOGS, `${id}.log`);
    const m = existsSync(log) ? /instance (\S+):/.exec(readFileSync(log, "utf8")) : null;
    if (m) names.add(m[1]);
  }
  return names;
}

export async function findInstances(now = Date.now()): Promise<Instance[]> {
  const client = new pg.Client({ connectionString: PG_URL });
  await client.connect();
  let rows: { datname: string; bytes: string; connections: string }[];
  try {
    ({ rows } = await client.query(
      `SELECT d.datname, pg_database_size(d.datname) AS bytes,
              (SELECT count(*) FROM pg_stat_activity a WHERE a.datname = d.datname) AS connections
       FROM pg_database d WHERE d.datname ~ '^(mb|wh)_pl_' ORDER BY 1`,
    ));
  } finally {
    await client.end();
  }
  const running = runningQueueInstances();
  const byName = new Map<string, Instance>();
  for (const r of rows) {
    const name = r.datname.replace(/^(mb|wh)_pl_/, "");
    const inst = byName.get(name) ?? { name, dbs: [], dir: null, logAgeMin: null, stale: false, reasons: [] };
    inst.dbs.push({ name: r.datname, bytes: Number(r.bytes), connections: Number(r.connections) });
    byName.set(name, inst);
  }
  for (const inst of byName.values()) {
    const dir = resolve(PIPELINE_DIRS, inst.name);
    const log = resolve(dir, "metabase.log");
    inst.dir = existsSync(dir) ? dir : null;
    inst.logAgeMin = existsSync(log) ? Math.round((now - statSync(log).mtimeMs) / 60_000) : null;
    const connections = inst.dbs.reduce((n, d) => n + d.connections, 0);
    if (connections > 0) inst.reasons.push(`${connections} open connection(s)`);
    if (inst.dir && existsSync(resolve(dir, "keep"))) inst.reasons.push("kept (--keep)");
    if (existsSync(log) && now - statSync(log).mtimeMs < RECENT_MS) inst.reasons.push("metabase.log written in the last 10 min");
    if (running.has(inst.name)) inst.reasons.push("a running queue job owns it");
    inst.stale = inst.reasons.length === 0;
  }
  return [...byName.values()];
}

const mb = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} MB`;

if (isMain(import.meta.url)) {
  const instances = await findInstances();
  for (const i of instances) {
    const verdict = i.stale ? "STALE" : `live: ${i.reasons.join("; ")}`;
    const log = i.logAgeMin === null ? "no log" : `log ${i.logAgeMin} min old`;
    console.log(`${i.name}  [${i.dbs.map((d) => `${d.name} ${mb(d.bytes)}`).join(", ")}]  ${i.dir ? "dir" : "no dir"}, ${log}  → ${verdict}`);
  }
  const stale = instances.filter((i) => i.stale);
  console.log(`\n${instances.length} instance(s), ${stale.length} stale. Nothing was dropped.`);
  if (stale.length) {
    console.log("\nTo remove the stale ones (run by hand, after checking the list above):");
    for (const i of stale) {
      for (const d of i.dbs) console.log(`docker exec semantic_search-postgres-1 dropdb -U postgres ${d.name}`);
      if (i.dir) console.log(`rm -rf '${i.dir}'`);
    }
  }
}
