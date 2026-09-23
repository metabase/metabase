// Shared types and helpers for the corpus generator. Zero dependencies: run with `node <file>.ts`
// (Node >= 22.18 strips types natively). `../shared/types.ts` is dependency-free too.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Scenario as SharedScenario } from "../shared/types.ts";

export { CATEGORY_TAGS } from "../shared/types.ts";

/** Entities apply.ts creates, in creation order. */
export const ENTITY_MODELS = ["card", "dataset", "metric", "dashboard", "document", "segment", "measure"] as const;
export type EntityModel = (typeof ENTITY_MODELS)[number];
export type SearchModel = EntityModel | "table" | "collection" | "database";

/** Saved as a Card; queries a table. */
export const isCardLike = (m: string): boolean => m === "card" || m === "dataset" || m === "metric";
/** Hangs off a table instead of living in a collection. */
export const isTableOwned = (m: string): boolean => m === "segment" || m === "measure";

interface Column { name: string; type: string }

export interface TableDef {
  key: string;
  name: string;
  displayName?: string;
  description?: string;
  columns: Column[];
}

export interface CollectionDef {
  key: string;
  name: string;
  parent?: string;
  /** The harness user gets no access. Used to check permission filtering. */
  restricted?: boolean;
}

export interface EntityDef {
  key: string;
  model: EntityModel;
  name: string;
  description?: string;
  /** card/dataset/metric/dashboard/document */
  collection?: string;
  /** segment/measure: the table they belong to; card-likes: the table they query */
  table?: string;
  /** document only: plain-text body (keyword-indexed, not embedded) */
  body?: string;
  /** card-likes only: a native SQL query run against the warehouse instead of the default table query.
   *  `table` stays required: it is the card's main table, for validation and readers. */
  sql?: string;
  /** card-likes only: MBQL clauses on `table`, with columns named rather than numbered. Excludes `sql`. */
  mbql?: MbqlDef;
  /** card-likes only: chart type, else apply.ts's per-model default. */
  display?: string;
}

/** A column of the card's table, optionally bucketed by a temporal unit ("month", "quarter", ...). */
export type MbqlColumn = string | [column: string, temporalUnit: string];
export type MbqlAggregation = ["count"] | [op: "sum" | "avg" | "distinct" | "min" | "max", column: string];
export type MbqlFilter =
  | [op: "=" | "!=", column: string, ...values: (string | number | boolean)[]]
  | [op: ">" | "<" | ">=" | "<=", column: string, value: number | string]
  | [op: "time-interval", column: string, amount: number | "current", unit: string]
  | [op: "not-null" | "is-null", column: string]
  | [op: "contains", column: string, value: string];
export interface MbqlDef {
  aggregation?: MbqlAggregation[];
  breakout?: MbqlColumn[];
  /** ANDed together. */
  filter?: MbqlFilter[];
}

/** Every column name an MbqlDef mentions, for validation. */
export function mbqlColumns(m: MbqlDef): string[] {
  return [
    ...(m.aggregation ?? []).flatMap((a) => (a.length > 1 ? [a[1] as string] : [])),
    ...(m.breakout ?? []).map((b) => (typeof b === "string" ? b : b[0])),
    ...(m.filter ?? []).map((f) => f[1]),
  ];
}

/** The artifact apply.ts consumes. Source files and the scale generator both produce this. */
export interface Corpus {
  corpusId: string;
  comment?: string;
  seed?: number;
  dataScale?: number;
  database: { key: string; name: string };
  schema: string;
  tables: TableDef[];
  collections: CollectionDef[];
  collectionDefaultTable?: Record<string, string>;
  entities: EntityDef[];
}

/** Written by apply.ts, read by resolve.ts and the runner. */
export interface Manifest {
  corpusId: string;
  metabaseUrl: string;
  appliedAt: string;
  databaseId: number;
  harnessUser: { email: string; password: string; id: number; groupId: number };
  timingsMs: Record<string, number>;
  /** key -> live entity. `model` is the search model string the engines return. */
  entities: Record<string, { model: SearchModel; id: number }>;
}

export interface AuthoredItem { ref: string; grade?: number }
export interface AuthoredScenario {
  id: string;
  query: string;
  tags: string[];
  lang: string;
  expected: AuthoredItem[];
  expectedAbsent?: AuthoredItem[];
  notes?: string;
}
export interface AuthoredScenarioFile { corpusId: string; comment?: string; scenarios: AuthoredScenario[] }

/** §3 scenario (shared type) whose items also carry their corpus `ref` for the drill-down. */
type WithRef<T> = T & { ref: string };
export type Scenario = Omit<SharedScenario, "expected" | "expectedAbsent"> & {
  expected: WithRef<SharedScenario["expected"][number]>[];
  expectedAbsent?: WithRef<NonNullable<SharedScenario["expectedAbsent"]>[number]>[];
};

export const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

export function writeText(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

export const writeJson = (path: string, value: unknown): void => writeText(path, JSON.stringify(value, null, 2) + "\n");

/** Tiny argv parser: --flag value / --flag=value / --bool. Positional args under `_`. */
export function parseArgs(argv: string[]): Record<string, string> & { _: string[] } {
  const out: Record<string, string> & { _: string[] } = { _: [] } as never;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { out._.push(a); continue; }
    const eq = a.indexOf("=");
    if (eq > 0) { out[a.slice(2, eq)] = a.slice(eq + 1); continue; }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[a.slice(2)] = "true";
    else { out[a.slice(2)] = next; i++; }
  }
  return out;
}

export function fail(msg: string): never {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

/** Every keyed thing in the corpus, as [key, search model]. The single list everything else derives from. */
export function corpusItems(c: Corpus): [string, SearchModel][] {
  return [
    [c.database.key, "database"],
    ...c.tables.map((t): [string, SearchModel] => [t.key, "table"]),
    ...c.collections.map((x): [string, SearchModel] => [x.key, "collection"]),
    ...c.entities.map((e): [string, SearchModel] => [e.key, e.model]),
  ];
}

export const corpusKeys = (c: Corpus): Map<string, SearchModel> => new Map(corpusItems(c));

/** Structural checks on a corpus. Returns a list of problems (empty = valid). */
export function validateCorpus(c: Corpus): string[] {
  const errs: string[] = [];
  const seen = new Set<string>();
  for (const [k, model] of corpusItems(c)) {
    if (seen.has(k)) errs.push(`duplicate key ${k}`);
    seen.add(k);
    if (!k.startsWith(model + "/")) errs.push(`key ${k} does not start with its model "${model}/"`);
  }
  const collections = new Set(c.collections.map((x) => x.key));
  const tables = new Set(c.tables.map((t) => t.key));
  for (const col of c.collections) {
    if (col.parent && !collections.has(col.parent)) errs.push(`${col.key}: unknown parent ${col.parent}`);
  }
  // apply.ts finds synced tables by name, so table names must be unique.
  const tableNames = new Set<string>();
  for (const t of c.tables) {
    if (!t.columns?.length) errs.push(`${t.key}: no columns`);
    if (tableNames.has(t.name)) errs.push(`${t.key}: table name ${t.name} is not unique`);
    tableNames.add(t.name);
  }
  for (const e of c.entities) {
    if (!e.name?.trim()) errs.push(`${e.key}: empty name`);
    if (isTableOwned(e.model)) {
      if (!(e.table && tables.has(e.table))) errs.push(`${e.key}: missing/unknown table ${e.table}`);
    } else if (!(e.collection && collections.has(e.collection))) {
      errs.push(`${e.key}: missing/unknown collection ${e.collection}`);
    }
    if (isCardLike(e.model)) {
      const t = cardTable(c, e);
      if (!(t && tables.has(t))) errs.push(`${e.key}: missing/unknown table to query ${t}`);
      if (e.sql !== undefined && e.mbql !== undefined) errs.push(`${e.key}: sql and mbql are exclusive`);
      if (e.sql !== undefined && !e.sql.trim()) errs.push(`${e.key}: empty sql`);
      if (e.mbql && t) {
        const cols = new Set(c.tables.find((x) => x.key === t)?.columns.map((col) => col.name));
        for (const col of mbqlColumns(e.mbql)) if (!cols.has(col)) errs.push(`${e.key}: mbql column ${col} not in ${t}`);
      }
    } else if (e.sql !== undefined || e.mbql !== undefined || e.display !== undefined) {
      errs.push(`${e.key}: sql/mbql/display are for card-likes only`);
    }
  }
  // Readability rule: people reading results tell entities apart by name, so keep names unique per family.
  const byFamily = new Map<string, string>();
  for (const e of c.entities) {
    const k = `${isCardLike(e.model) ? "card" : e.model}\u0000${e.name}`;
    if (byFamily.has(k)) errs.push(`${e.key}: name "${e.name}" also used by ${byFamily.get(k)}`);
    byFamily.set(k, e.key);
  }
  return errs;
}

/** The table a card-like entity queries: explicit, else its collection's default. */
export function cardTable(c: Corpus, e: EntityDef): string | undefined {
  return e.table ?? (e.collection ? c.collectionDefaultTable?.[e.collection] : undefined);
}
