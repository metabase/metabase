// Creates a corpus in a running Metabase through its REST API and writes the key -> id manifest.
// Run by whoever owns the instance (the runner). Uses only public endpoints — no Metabase internals.
//
// Prerequisite: warehouse.sql applied to a Postgres that the Metabase server can reach, e.g.
//   docker exec -i semantic_search-postgres-1 createdb -U postgres northwind_warehouse
//   docker exec -i semantic_search-postgres-1 psql -U postgres -d northwind_warehouse < ../artifacts/golden/warehouse.sql
//
//   node apply.ts --corpus ../artifacts/golden/corpus.json \
//     --url http://localhost:3002 --user dev@metabase.local --password devdev1234 \
//     --pg-host localhost --pg-port 55432 --pg-db northwind_warehouse --pg-user postgres --pg-password postgres \
//     [--out ../artifacts/golden/manifest.json] [--concurrency 8] [--sync-timeout-s 900]
//
// It also creates a non-admin harness user in a dedicated group (fairness rule 4): read access to every
// corpus collection except `restricted` ones, and query access to the warehouse. The credentials go in
// the manifest so the runner can log in as that user.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  type Corpus, type EntityDef, type EntityModel, type Manifest, type MbqlDef, type SearchModel,
  ENTITY_MODELS, cardTable, corpusKeys, fail, parseArgs, readJson, validateCorpus, writeJson,
} from "./lib.ts";

const t0 = Date.now();
const args = parseArgs(process.argv.slice(2));
for (const k of ["corpus", "url", "user", "password", "pg-db"]) if (!args[k]) fail(`--${k} is required (see header comment)`);

const corpus = readJson<Corpus>(args.corpus);
const invalid = validateCorpus(corpus);
if (invalid.length) fail(`corpus invalid:\n  ${invalid.slice(0, 20).join("\n  ")}`);
const base = args.url.replace(/\/$/, "");
const out = args.out ?? join(dirname(args.corpus), "manifest.json");
const concurrency = Number(args.concurrency ?? 8);
const syncTimeoutMs = Number(args["sync-timeout-s"] ?? 900) * 1000;
if (existsSync(out) && args.force !== "true") fail(`${out} exists — this corpus looks applied already. Use a fresh instance, or --force.`);

// ------------------------------------------------------------------------------------------ http

let session = "";
async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", ...(session ? { "X-Metabase-Session": session } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (res.ok) return (text ? JSON.parse(text) : null) as T;
    // Retry transient server failures only for idempotent calls: a retried POST can create a duplicate.
    // 4xx means the payload is wrong — fail loudly.
    if (res.status >= 500 && method !== "POST" && attempt < 3) { await sleep(500 * attempt); continue; }
    throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 500)}\nbody: ${JSON.stringify(body)?.slice(0, 500)}`);
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run `fn` over `items` with bounded concurrency. */
async function pool<T>(items: T[], fn: (x: T) => Promise<unknown>, label: string): Promise<void> {
  let next = 0, done = 0;
  const started = Date.now();
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      await fn(items[next++]);
      if (++done % 500 === 0) console.log(`    ${label}: ${done}/${items.length}`);
    }
  }));
  if (items.length) console.log(`  ${label}: ${items.length} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

// ------------------------------------------------------------------------------------------ main

const manifestEntities: Manifest["entities"] = {};
const record = (key: string, model: SearchModel, id: number) => { manifestEntities[key] = { model, id }; };
const idOf = (key: string) => manifestEntities[key].id;
const timings: Record<string, number> = {};
async function phase<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const started = Date.now();
  console.log(`== ${name}`);
  const r = await fn();
  timings[name] = Date.now() - started;
  return r;
}

session = (await api<{ id: string }>("POST", "/api/session", { username: args.user, password: args.password })).id;

// 1. Warehouse database + sync
const dbId = await phase("database", async () => {
  const existing = (await api<{ data: any[] }>("GET", "/api/database")).data.find((d) => d.name === corpus.database.name);
  if (existing) fail(`a database named "${corpus.database.name}" already exists (id ${existing.id}). Use a fresh instance.`);
  const db = await api("POST", "/api/database", {
    name: corpus.database.name,
    engine: "postgres",
    details: {
      host: args["pg-host"] ?? "localhost",
      port: Number(args["pg-port"] ?? 5432),
      dbname: args["pg-db"],
      user: args["pg-user"] ?? "postgres",
      password: args["pg-password"] ?? "",
      ssl: false,
      "schema-filters-type": "inclusion",
      "schema-filters-patterns": corpus.schema,
    },
  });
  record(corpus.database.key, "database", db.id);
  return db.id as number;
});

type TableMeta = { id: number; name: string; description: string | null; display_name: string; fields: { id: number; name: string }[] };
/** Table key -> synced table metadata. */
const tableMeta = await phase("sync", async () => {
  const deadline = Date.now() + syncTimeoutMs;
  const waitOrFail = async (what: string) => {
    if (Date.now() > deadline) fail(`sync timed out: ${what}`);
    console.log(`  waiting for sync: ${what}`);
    await sleep(3000);
  };
  // Cheap poll first: the full metadata payload (every table and field) is expensive at scale, and
  // fetching it repeatedly competes with the sync it is waiting on.
  for (;;) {
    const { initial_sync_status } = await api<{ initial_sync_status: string }>("GET", `/api/database/${dbId}`);
    if (initial_sync_status === "complete") break;
    await waitOrFail(`initial_sync_status=${initial_sync_status}`);
  }
  const byName = new Map(corpus.tables.map((t) => [t.name, t.key]));
  for (;;) {
    const meta = await api<{ tables: TableMeta[] }>("GET", `/api/database/${dbId}/metadata?include_hidden=true`);
    const got = new Map(meta.tables.filter((t) => byName.has(t.name) && t.fields.length > 0).map((t) => [byName.get(t.name)!, t]));
    if (got.size === byName.size) return got;
    await waitOrFail(`${got.size}/${byName.size} tables have fields`);
  }
});

await phase("tables", async () => {
  await pool(corpus.tables, async (t) => {
    const meta = tableMeta.get(t.key)!;
    record(t.key, "table", meta.id);
    const patch: Record<string, string> = {};
    if (t.displayName && t.displayName !== meta.display_name) patch.display_name = t.displayName;
    if (t.description && t.description !== meta.description) patch.description = t.description;
    if (Object.keys(patch).length) await api("PUT", `/api/table/${meta.id}`, patch);
  }, "tables");
});

// 2. Collections, parents before children. Sequential: concurrent creation races on
// COLLECTION_PERMISSION_GRAPH_REVISION ids in Metabase (PK violation, observed on H2).
await phase("collections", async () => {
  let pending = corpus.collections;
  while (pending.length) {
    const ready = pending.filter((c) => !c.parent || manifestEntities[c.parent]);
    if (!ready.length) fail(`collection parent cycle among ${pending.map((c) => c.key).join(", ")}`);
    for (const c of ready) {
      const res = await api("POST", "/api/collection", { name: c.name, ...(c.parent ? { parent_id: idOf(c.parent) } : {}) });
      record(c.key, "collection", res.id);
    }
    pending = pending.filter((c) => !manifestEntities[c.key]);
  }
  console.log(`  collections: ${corpus.collections.length}`);
});

// 3. Entities
const legacyQuery = (table: string, extra: Record<string, unknown> = {}) =>
  ({ database: dbId, type: "query", query: { "source-table": tableMeta.get(table)!.id, ...extra } });
const desc = (e: EntityDef) => (e.description?.trim() ? { description: e.description } : {});
const COUNT = { aggregation: [["count"]] };

/** An MbqlDef's clauses as legacy MBQL on `table`, column names resolved to synced field ids. */
function mbqlClauses(table: string, m: MbqlDef): Record<string, unknown> {
  const meta = tableMeta.get(table)!;
  const field = (col: string, opts: Record<string, unknown> | null = null) =>
    ["field", meta.fields.find((f) => f.name === col)?.id ?? fail(`${table}: no synced field ${col}`), opts];
  const filters = (m.filter ?? []).map(([op, col, ...rest]) => [op, field(col), ...rest]);
  return {
    ...(m.aggregation ? { aggregation: m.aggregation.map(([op, col]) => (col ? [op, field(col)] : [op])) } : {}),
    ...(m.breakout ? { breakout: m.breakout.map((b) => (typeof b === "string" ? field(b) : field(b[0], { "temporal-unit": b[1] }))) } : {}),
    ...(filters.length ? { filter: filters.length === 1 ? filters[0] : ["and", ...filters] } : {}),
  };
}

const cardQuery = (e: EntityDef, extra: Record<string, unknown>) =>
  e.sql !== undefined
    ? { database: dbId, type: "native", native: { query: e.sql, "template-tags": {} } }
    : legacyQuery(cardTable(corpus, e)!, e.mbql ? mbqlClauses(cardTable(corpus, e)!, e.mbql) : extra);

const createCard = (type: string, display: string, extra: Record<string, unknown> = {}) => async (e: EntityDef) =>
  (await api("POST", "/api/card", {
    name: e.name, ...desc(e), type, display: e.display ?? display, visualization_settings: {},
    collection_id: idOf(e.collection!), dataset_query: cardQuery(e, extra),
  })).id;

const creators: Record<EntityModel, (e: EntityDef) => Promise<number>> = {
  card: createCard("question", "table"),
  dataset: createCard("model", "table"),
  metric: createCard("metric", "scalar", COUNT),
  dashboard: async (e) => (await api("POST", "/api/dashboard", {
    name: e.name, ...desc(e), collection_id: idOf(e.collection!),
  })).id,
  document: async (e) => (await api("POST", "/api/document", {
    name: e.name, collection_id: idOf(e.collection!),
    document: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: e.body?.trim() || e.name }] }] },
  })).id,
  segment: async (e) => (await api("POST", "/api/segment", {
    name: e.name, ...desc(e),
    definition: legacyQuery(e.table!, { filter: ["not-null", ["field", tableMeta.get(e.table!)!.fields[0].id, null]] }),
  })).id,
  measure: async (e) => (await api("POST", "/api/measure", {
    name: e.name, ...desc(e), definition: legacyQuery(e.table!, COUNT),
  })).id,
};

for (const model of ENTITY_MODELS) {
  const items = corpus.entities.filter((e) => e.model === model);
  if (!items.length) continue;
  await phase(model, () => pool(items, async (e) => record(e.key, model, await creators[model](e)), model));
}

// 4. Harness user, group and permissions
const harnessUser = await phase("permissions", async () => {
  const groups = await api<any[]>("GET", "/api/permissions/group");
  const allUsers = groups.find((g) => g.magic_group_type === "all-internal-users" || g.name === "All Users") ?? fail("no All Users group");
  const group = await api("POST", "/api/permissions/group", { name: `Harness ${corpus.corpusId}` });
  const email = args["harness-email"] ?? `harness+${corpus.corpusId.replace(/[^a-z0-9-]/gi, "")}@example.com`;
  const password = args["harness-password"] ?? "harness-Readonly-2026";
  const user = await api("POST", "/api/user", {
    first_name: "Harness", last_name: "Reader", email, password,
    user_group_memberships: [{ id: allUsers.id }, { id: group.id }],
  });

  // Collections: our group reads everything unrestricted; nobody but admins sees restricted ones.
  // force=true skips the revision check; skip-graph=true avoids echoing the whole graph back.
  // Chunked: one PUT over 1000 collections hit an H2 statement timeout (500) at scale 10k.
  const CHUNK = 100;
  for (let i = 0; i < corpus.collections.length; i += CHUNK) {
    const ours: Record<string, string> = {};
    const allUsersPatch: Record<string, string> = {};
    for (const c of corpus.collections.slice(i, i + CHUNK)) {
      const id = String(idOf(c.key));
      ours[id] = c.restricted ? "none" : "read";
      if (c.restricted) allUsersPatch[id] = "none";
    }
    await api("PUT", "/api/collection/graph?force=true&skip-graph=true", {
      groups: { [group.id]: ours, ...(Object.keys(allUsersPatch).length ? { [allUsers.id]: allUsersPatch } : {}) },
    });
  }

  // Data: our group can see and query the warehouse (needed for tables, segments, measures to be visible).
  // The data-permissions graph PUT still requires `revision` alongside force.
  const { revision } = await api("GET", "/api/permissions/graph");
  await api("PUT", "/api/permissions/graph?force=true&skip-graph=true", {
    revision,
    groups: { [group.id]: { [dbId]: { "view-data": "unrestricted", "create-queries": "query-builder" } } },
  });
  return { email, password, id: user.id as number, groupId: group.id as number };
});

// 5. Manifest
const missing = [...corpusKeys(corpus).keys()].filter((k) => !manifestEntities[k]);
if (missing.length) fail(`${missing.length} corpus key(s) missing from manifest: ${missing.slice(0, 10).join(", ")}`);
timings.total = Date.now() - t0;
const manifest: Manifest = {
  corpusId: corpus.corpusId,
  metabaseUrl: base,
  appliedAt: new Date().toISOString(),
  databaseId: dbId,
  harnessUser,
  timingsMs: timings,
  entities: manifestEntities,
};
writeJson(out, manifest);
console.log(`\nApplied ${Object.keys(manifestEntities).length} entities for ${corpus.corpusId} in ${(timings.total / 1000).toFixed(1)}s. Manifest: ${out}`);
console.log("Search indexing runs asynchronously — wait for the engines to report the new document count before querying.");
