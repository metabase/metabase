// Extracts a searchable-entity catalogue from the restored, sanitized Stats app DB (corpus stats-real-v1).
// Output is REAL INTERNAL CONTENT: it is written under local/ (git-ignored) only, never into the repo tree.
//
//   node extract.ts [--db mb_stats_real] [--out ../../../../local/stats-real/catalogue.json]
//
// Reads Postgres through `docker exec psql` (zero npm dependencies). Scope: what a non-admin harness user can
// be granted — non-archived items outside personal collections; active, visible tables.
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { parseArgs, writeJson } from "../lib.ts";

const args = parseArgs(process.argv.slice(2));
const db = args.db ?? "mb_stats_real";
const out = args.out ?? join(import.meta.dirname, "../../../../local/stats-real/catalogue.json");

function query<T>(sql: string): T[] {
  const text = execFileSync(
    "docker",
    ["exec", "-i", "semantic_search-postgres-1", "psql", "-U", "postgres", "-d", db, "-tA", "-c",
      `select coalesce(json_agg(t), '[]') from (${sql}) t`],
    { encoding: "utf8", maxBuffer: 1 << 30 },
  );
  return JSON.parse(text) as T[];
}

// Collections outside personal trees. `location` is "/1/5/" style; a personal root anywhere in it disqualifies.
const personalRoots = new Set(query<{ id: number }>(`select id from collection where personal_owner_id is not null`).map((r) => r.id));
const collections = query<{ id: number; name: string; description: string | null; location: string; archived: boolean }>(
  `select id, name, description, location, archived from collection where namespace is null and personal_owner_id is null`,
).filter((c) => !c.archived && !c.location.split("/").filter(Boolean).some((x) => personalRoots.has(Number(x))));
const sharedCollections = new Set(collections.map((c) => c.id));
const collectionName = new Map(collections.map((c) => [c.id, c.name]));
const inShared = (id: number | null) => id === null || sharedCollections.has(id); // null = root collection

const cards = query<{ id: number; type: string; name: string; description: string | null; collection_id: number | null; q: string; display: string }>(
  `select id, type, name, description, collection_id, dataset_query::text as q, display from report_card where not archived`,
).filter((c) => inShared(c.collection_id)).map((c) => {
  const native = c.q.includes('"native"');
  let sql: string | undefined;
  if (native) {
    try {
      const q = JSON.parse(c.q);
      sql = q?.native?.query ?? q?.stages?.[0]?.native ?? undefined;
    } catch { /* keep undefined */ }
  }
  return {
    key: `${c.type === "question" ? "card" : c.type === "model" ? "dataset" : "metric"}/${c.id}`,
    model: c.type === "question" ? "card" : c.type === "model" ? "dataset" : "metric",
    id: c.id, name: c.name, description: c.description ?? undefined, collection: collectionName.get(c.collection_id ?? -1),
    display: c.display, native, sql: sql?.slice(0, 4000), mbql: native ? undefined : c.q.slice(0, 2000),
  };
});

const dashcards = query<{ dashboard_id: number; card_name: string }>(
  `select dc.dashboard_id, rc.name as card_name from report_dashboardcard dc join report_card rc on rc.id = dc.card_id where not rc.archived`,
);
const cardsByDash = Map.groupBy(dashcards, (d) => d.dashboard_id);
const dashboards = query<{ id: number; name: string; description: string | null; collection_id: number | null }>(
  `select id, name, description, collection_id from report_dashboard where not archived`,
).filter((d) => inShared(d.collection_id)).map((d) => ({
  key: `dashboard/${d.id}`, model: "dashboard", id: d.id, name: d.name, description: d.description ?? undefined,
  collection: collectionName.get(d.collection_id ?? -1), cards: (cardsByDash.get(d.id) ?? []).map((x) => x.card_name).slice(0, 40),
}));

const fields = query<{ table_id: number; name: string; display_name: string; description: string | null }>(
  `select table_id, name, display_name, description from metabase_field where active and visibility_type <> 'retired' order by table_id, position`,
);
const fieldsByTable = Map.groupBy(fields, (f) => f.table_id);
const tables = query<{ id: number; db_id: number; schema: string | null; name: string; display_name: string; description: string | null }>(
  `select id, db_id, schema, name, display_name, description from metabase_table where active and visibility_type is null`,
).map((t) => ({
  key: `table/${t.id}`, model: "table", id: t.id, name: t.display_name || t.name, rawName: t.name, schema: t.schema ?? undefined,
  dbId: t.db_id, description: t.description ?? undefined,
  columns: (fieldsByTable.get(t.id) ?? []).slice(0, 80).map((f) => ({ name: f.name, displayName: f.display_name, description: f.description ?? undefined })),
}));

const documents = query<{ id: number; name: string; collection_id: number | null; doc: string }>(
  `select id, name, collection_id, document::text as doc from document where not archived`,
).filter((d) => inShared(d.collection_id)).map((d) => {
  const texts: string[] = [];
  const walk = (n: any) => { if (n?.text) texts.push(n.text); (n?.content ?? []).forEach(walk); };
  try { walk(JSON.parse(d.doc)); } catch { /* ignore */ }
  return { key: `document/${d.id}`, model: "document", id: d.id, name: d.name, collection: collectionName.get(d.collection_id ?? -1), body: texts.join(" ").slice(0, 3000) };
});

const segments = query<{ id: number; name: string; description: string | null; table_id: number }>(
  `select id, name, description, table_id from segment where not archived`,
).map((s) => ({ key: `segment/${s.id}`, model: "segment", id: s.id, name: s.name, description: s.description ?? undefined, tableId: s.table_id }));
const measures = query<{ id: number; name: string; description: string | null; table_id: number }>(
  `select id, name, description, table_id from measure where not archived`,
).map((s) => ({ key: `measure/${s.id}`, model: "measure", id: s.id, name: s.name, description: s.description ?? undefined, tableId: s.table_id }));

const colls = collections.map((c) => ({ key: `collection/${c.id}`, model: "collection", id: c.id, name: c.name, description: c.description ?? undefined }));

const catalogue = { corpusId: "stats-real-v1", entities: [...cards, ...dashboards, ...tables, ...colls, ...documents, ...segments, ...measures] };
writeJson(out, catalogue);
const counts = Object.entries(Object.groupBy(catalogue.entities, (e) => e.model)).map(([m, v]) => `${m}=${v!.length}`);
console.log(`catalogue: ${catalogue.entities.length} entities (${counts.join(" ")}) -> ${out}`);
