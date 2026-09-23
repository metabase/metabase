/**
 * Synthetic results for building and rehearsing the harness data app before real runs exist.
 *
 * Everything here is FAKE. It is written under corpus_id = "fixture" with a FIXTURE note on every run,
 * and the dashboard's Corpus filter keeps it apart from real data. The numbers deliberately encode the
 * plan's *hypotheses* (keyword wins exact-name/rare-token, semantic wins paraphrase/concept, the embedder
 * dominates quality variance, the 0.7 cutoff zeroes minilm paraphrase queries) so every card has
 * something to show. Do not quote them. Per-category cells are left realistically noisy (n = 2–10).
 *
 * Shape: 5 engines × 2 embedders × 3 scale tiers × 40 scenarios × 5 iterations, plus two extra
 * embedding-text variants (axis 4) at the smallest scale only — re-embedding is the expensive part, so real
 * variant runs will be small too. One run per (embedder, scale, variant), per contract §5.2/2a. Metrics come
 * from the real metrics library (../../metrics), computed over the generated ranked lists, so the
 * drill-down and the metric cards agree and the dashboard shows exactly what real runs will produce.
 *
 *   npm run fixtures        # clears previous fixture runs, writes new ones
 */
import { toMetricRows } from "../../metrics/src/metrics.ts";
import {
  type CategoryTag as Tag,
  EMBEDDING_TEXT_VARIANTS as VARIANTS,
  ENGINES,
  type EmbeddingTextVariant as Variant,
  type Engine,
  isVectorEngine as isVector,
} from "../../shared/types.ts";

import { isMain } from "./is-main.ts";
import {
  type QueryResultRow,
  type ReturnedItem,
  type Scenario,
  close,
  finishRun,
  getPool,
  recordMetrics,
  recordQueryResults,
  recordScenarios,
  startRun,
} from "./writer.ts";

export const CORPUS_ID = "fixture";
const NOTE = "FIXTURE — synthetic data from hackathon/harness/results/src/fixtures.ts, not a measurement. seed=42";

// ---------------------------------------------------------------------------------------------------
// Seeded randomness (mulberry32 + Box–Muller), keyed by string parts so draws are reproducible.

type Rng = { next: () => number; int: (n: number) => number; gauss: () => number };

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function rng(...parts: (string | number)[]): Rng {
  let a = fnv1a(["42", ...parts].join("\u0000"));
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n) => Math.floor(next() * n),
    gauss: () => Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next()),
  };
}

// ---------------------------------------------------------------------------------------------------
// Scenarios

const QUERIES: Record<Tag, string[]> = {
  paraphrase: ["how much money did we bring in", "who buys our stuff", "people who stopped paying",
    "stuff that got sent back", "how fast do we ship things", "which ads actually work", "money we are owed",
    "where do our buyers live", "what do customers think of us", "staff headcount over time"],
  concept: ["customer churn", "revenue", "marketing funnel", "inventory health", "retention cohorts",
    "unit economics", "sales pipeline", "product quality"],
  "exact-name": ["Orders by Month", "Monthly Recurring Revenue", "Customer Lifetime Value",
    "Product Reviews Dashboard", "Weekly Active Users", "Refunds Overview"],
  "rare-token": ["ORD-2024-0042", "stg_orders_v2", "sku_4471", "PEOPLE.LATITUDE"],
  typo: ["reveune by month", "custmer churn", "prodcut reviews", "odrers per week"],
  "cross-lingual": ["przychód miesięczny", "odejścia klientów", "月次売上", "顧客レビュー"],
  ambiguous: ["orders", "users"],
  "empty-expected": ["quantum flux capacitor", "weather in lisbon"],
};

type Entity = { model: string; id: number };
const key = (e: Entity) => `${e.model}:${e.id}`;

function fakeEntity(r: Rng): Entity {
  return r.next() < 0.8 ? { model: "card", id: 1 + r.int(300) } : { model: "dashboard", id: 1 + r.int(40) };
}

function distinctEntities(r: Rng, n: number, exclude = new Set<string>()): Entity[] {
  const out: Entity[] = [];
  const seen = new Set(exclude);
  while (out.length < n) {
    const e = fakeEntity(r);
    if (!seen.has(key(e))) {
      seen.add(key(e));
      out.push(e);
    }
  }
  return out;
}

function expectedCount(tag: Tag, r: Rng): number {
  switch (tag) {
    case "empty-expected": return 0;
    case "concept": return 3 + r.int(2);
    case "ambiguous": return 4 + r.int(2);
    default: return 1 + r.int(2);
  }
}

function scenarios(): Scenario[] {
  const r = rng("scenarios");
  return (Object.entries(QUERIES) as [Tag, string[]][]).flatMap(([tag, queries]) =>
    queries.map((query, i) => ({
      id: `fx-${tag}-${String(i + 1).padStart(2, "0")}`,
      query,
      tags: [tag],
      lang: /[ąęółśźżćń]/.test(query) ? "pl" : /[぀-ヿ一-鿿]/.test(query) ? "ja" : "en",
      expected: distinctEntities(r, expectedCount(tag, r)).map((e, j) => ({ ...e, grade: j === 0 ? 2 : 1 + r.int(2) })),
      // Must-not-read items (permission_leak): ids above the fake corpus range, so no engine returns them —
      // the fixture rehearses the all-clear state of the leak check.
      ...(tag === "empty-expected" ? { expectedAbsent: [{ model: "card", id: 900 + i }] } : {}),
      notes: "fixture",
    })),
  );
}

// ---------------------------------------------------------------------------------------------------
// Engines

type Embedder = { embedder: string; dimensions: number; embedMs: number };
export const EMBEDDERS: Embedder[] = [
  { embedder: "ollama/all-minilm", dimensions: 384, embedMs: 12 },
  { embedder: "ollama/snowflake-arctic-embed2", dimensions: 1024, embedMs: 38 },
];
const MINILM = EMBEDDERS[0].embedder;

const SCALES = [100, 1000, 10000];

/** Axis 4. Only the vector arm sees the embedding text, so keyword engines are identical across variants. */
const VARIANT_BOOST: Record<Variant, Probs> = {
  baseline: {},
  context: { paraphrase: 0.08, concept: 0.12, ambiguous: 0.05, "exact-name": -0.02 },
  "context-sql": { paraphrase: 0.05, concept: 0.1, "rare-token": 0.25 },
};
const ITERATIONS = 5;

type Probs = Partial<Record<Tag, number>>;
const KEYWORD_HIT: Partial<Record<Engine, Probs>> = {
  appdb: { "exact-name": 0.95, "rare-token": 0.9, paraphrase: 0.1, concept: 0.35, typo: 0.25, "cross-lingual": 0.02, ambiguous: 0.6 },
  "in-place": { "exact-name": 0.9, "rare-token": 0.85, paraphrase: 0.05, concept: 0.25, typo: 0.05, "cross-lingual": 0, ambiguous: 0.5 },
};
const VECTOR_HIT: Probs = { "exact-name": 0.8, "rare-token": 0.35, paraphrase: 0.8, concept: 0.8, typo: 0.75, "cross-lingual": 0.75, ambiguous: 0.65 };
const MINILM_PENALTY: Probs = { "exact-name": 0.05, "rare-token": 0.1, paraphrase: 0.35, concept: 0.3, typo: 0.2, "cross-lingual": 0.7, ambiguous: 0.15 };

function hitProb(engine: Engine, embedder: string, variant: Variant, tag: Tag): number {
  if (!isVector(engine)) {
    return KEYWORD_HIT[engine]?.[tag] ?? 0;
  }
  let p = (VECTOR_HIT[tag] ?? 0) + (VARIANT_BOOST[variant][tag] ?? 0);
  if (embedder === MINILM) p -= MINILM_PENALTY[tag] ?? 0;
  if (engine === "sqlite-vec1") p += 0.01;
  if (engine === "lucene") p += tag === "exact-name" || tag === "rare-token" ? 0.15 : -0.03;
  return p;
}

/** Probability of returning nothing — the 0.7 cosine cutoff for vector engines, no token overlap for keyword ones. */
function zeroProb(engine: Engine, embedder: string, tag: Tag): number {
  if (tag === "empty-expected") {
    return isVector(engine) ? (embedder === MINILM ? 0.3 : 0.5) : 0.9;
  }
  if (isVector(engine)) {
    return embedder === MINILM
      ? ({ paraphrase: 0.3, "cross-lingual": 0.6, concept: 0.15, typo: 0.1 } as Probs)[tag] ?? 0.03
      : ({ paraphrase: 0.08, "cross-lingual": 0.1 } as Probs)[tag] ?? 0.02;
  }
  return ({ paraphrase: 0.7, "cross-lingual": 0.95, typo: engine === "in-place" ? 0.8 : 0.4 } as Probs)[tag] ?? 0.05;
}

// ---------------------------------------------------------------------------------------------------
// Ranked lists

const SUBJECTS = ["Orders", "Revenue", "Customers", "Churn", "Refunds", "Products", "Reviews", "Shipments", "Invoices",
  "Signups", "Campaigns", "Inventory", "Headcount", "Sessions", "Subscriptions", "Returns", "Leads", "Payments"];
const CUTS = ["by Month", "by Region", "per Week", "Overview", "Trend", "by Channel", "Cohorts", "by Product", "Funnel", "Forecast"];

/** Deterministic display name for a fake entity, so the drill-down reads like real results. */
function fakeName({ model, id }: Entity): string {
  return `${SUBJECTS[(id * 7) % SUBJECTS.length]} ${CUTS[Math.floor(id / 3) % CUTS.length]}${model === "dashboard" ? " Dashboard" : ""}`;
}

/** 20 plausible-but-wrong entities per scenario, shared by all engines so their lists overlap. */
function distractorPool(s: Scenario): Entity[] {
  return distinctEntities(rng("pool", s.id), 20, new Set(s.expected.map(key)));
}

/** Engines the fixtures fake. The *-pure columns only ever come from a real --pure-vector run. */
const FIXTURE_ENGINES = ENGINES.filter((e) => e !== "semantic-pure" && e !== "semantic-vector" && e !== "sqlite-vec1-pure" && e !== "lucene-pure");
type FixtureEngine = Exclude<Engine, "semantic-pure" | "semantic-vector" | "sqlite-vec1-pure" | "lucene-pure">;

const ENGINE_SD: Record<FixtureEngine, number> = { semantic: 0.3, "sqlite-vec1": 0.3, lucene: 2.5, appdb: 1.5, "in-place": 1.5 };

/**
 * Vector engines share an embedder-level ordering (semantic ≈ sqlite-vec1, lucene noisier); keyword engines
 * share a different, embedder-independent one.
 */
function orderedDistractors(s: Scenario, engine: FixtureEngine, embedder: string): Entity[] {
  const pool = distractorPool(s);
  const fam = isVector(engine) ? rng("family", s.id, "vector", embedder) : rng("family", s.id, "keyword");
  const familyKey = pool.map(() => fam.gauss());
  const eng = rng("engine", s.id, engine, embedder);
  return pool
    .map((item, i) => ({
      item,
      k: (isVector(engine) ? i : (i * 7) % 20) + 3 * familyKey[i] + ENGINE_SD[engine] * eng.gauss(),
    }))
    .sort((a, b) => a.k - b.k)
    .map(({ item }) => item);
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * The fake top-k an engine returns for a scenario. Deterministic per (scenario, engine, embedder).
 *
 * Engines of one family (vector engines on the same embedder; keyword engines) share their random draws —
 * common random numbers — so they differ only where their parameters differ. Two vector engines over the
 * same embeddings should mostly agree, and independent draws would hide that. Draws are not keyed by
 * variant either, so a variant moves only the hit probability: variant deltas are the planted effect.
 */
function rankedList(s: Scenario, engine: FixtureEngine, embedder: string, variant: Variant = "baseline"): ReturnedItem[] {
  const tag = s.tags[0] as Tag;
  const fam = isVector(engine) ? rng("list", s.id, "vector", embedder) : rng("list", s.id, "keyword");
  const eng = rng("list", s.id, engine, embedder);
  const difficulty = 0.1 * rng("difficulty", s.id).gauss();
  const q = clamp01(hitProb(engine, embedder, variant, tag) - difficulty);
  const zero = fam.next() < zeroProb(engine, embedder, tag);
  const nBase = isVector(engine) ? 3 + fam.int(8) : 1 + fam.int(10);
  const draws = s.expected.map(() => [fam.next(), fam.next()] as const);
  if (zero) {
    return [];
  }
  const n = engine === "semantic" || engine === "sqlite-vec1" ? nBase : Math.max(1, Math.min(10, nBase + eng.int(5) - 2));
  const hits = s.expected
    .map((e, i) => ({ e, uHit: draws[i][0], uPos: draws[i][1] }))
    .filter(({ uHit }) => uHit < q)
    .map(({ e, uPos }) => ({ pos: Math.floor(10 * Math.pow(uPos, 1 + 2 * q + e.grade)), item: { model: e.model, id: e.id } }))
    .sort((a, b) => a.pos - b.pos);
  const ranked = orderedDistractors(s, engine, embedder);
  for (const { pos, item } of hits) {
    ranked.splice(Math.min(pos, ranked.length), 0, item);
  }
  const [base, step] = isVector(engine) ? [0.92, 0.025] : [12, 1.1];
  return ranked.slice(0, n).map((item, i) => ({ ...item, name: fakeName(item), score: base - i * step - 0.01 * eng.next() }));
}

// ---------------------------------------------------------------------------------------------------
// Latency

function latencySample(r: Rng, engine: FixtureEngine, { dimensions, embedMs }: Embedder, scale: number) {
  const lognorm = (m: number) => m * Math.exp(0.25 * r.gauss()) * (r.next() < 0.05 ? 3 : 1);
  const log10s = Math.log10(scale);
  const storeBase = {
    semantic: 1.5 + 1.8 * log10s,
    "sqlite-vec1": 1 + scale * 0.0015 * (dimensions / 384),
    lucene: 2 + 1.2 * log10s,
    appdb: 2 + scale * 0.0033,
    "in-place": 3 + scale * 0.038,
  }[engine];
  const embed = isVector(engine) ? lognorm(embedMs) : null;
  const store = lognorm(storeBase);
  const filter = isVector(engine) ? lognorm(1 + 0.5 * log10s) : null;
  const overhead = lognorm(2);
  return { latencyMs: (embed ?? 0) + store + (filter ?? 0) + overhead, embedMs: embed, storeMs: store, filterMs: filter };
}

// ---------------------------------------------------------------------------------------------------
// Generation

function queryResults(scs: Scenario[], emb: Embedder, scale: number, variant: Variant): QueryResultRow[] {
  const r = rng("latency", emb.embedder, scale, variant);
  const rows: QueryResultRow[] = [];
  for (const s of scs) {
    for (const e of FIXTURE_ENGINES as FixtureEngine[]) {
      const returned = rankedList(s, e, emb.embedder, variant);
      for (let i = 0; i < ITERATIONS; i++) {
        const error = e === "lucene" && s.id === "fx-cross-lingual-03" && i === 2;
        rows.push({
          engine: e, embedder: emb.embedder, dimensions: emb.dimensions, scenarioId: s.id, iteration: i,
          resultCount: error ? 0 : returned.length,
          rawCount: error ? 0 : returned.length + r.int(4),
          returned: error ? null : returned,
          error: error ? "IllegalStateException: analyzer produced no tokens (fixture)" : null,
          ...latencySample(r, e, emb, scale),
        });
      }
    }
  }
  return rows;
}

/** Delete every run (and its rows) under the fixture corpus. Fixture-only — real runs are append-only. */
async function clearFixtures(): Promise<void> {
  const runs = "(SELECT run_id FROM harness_run WHERE corpus_id = $1)";
  const pool = getPool();
  for (const table of ["harness_metric", "harness_query_result", "harness_scenario"]) {
    await pool.query(`DELETE FROM ${table} WHERE run_id IN ${runs}`, [CORPUS_ID]);
  }
  await pool.query("DELETE FROM harness_run WHERE corpus_id = $1", [CORPUS_ID]);
}

/** Replace the fixture corpus with a fresh set of runs. Returns the new run ids. */
export async function generateFixtures(): Promise<string[]> {
  await clearFixtures();
  const scs = scenarios();
  const runIds: string[] = [];
  for (const emb of EMBEDDERS) {
    for (const scale of SCALES) {
      for (const variant of scale === SCALES[0] ? VARIANTS : (["baseline"] as const)) {
        const rows = queryResults(scs, emb, scale, variant);
        const runId = await startRun({
          gitSha: "fixture", branch: "fixture", dataScale: scale, corpusId: CORPUS_ID, notes: NOTE, embeddingText: variant,
        });
        await recordScenarios(runId, scs);
        await recordQueryResults(runId, rows);
        await recordMetrics(runId, toMetricRows(scs, rows));
        await finishRun(runId);
        runIds.push(runId);
      }
    }
  }
  return runIds;
}

if (isMain(import.meta.url)) {
  const ids = await generateFixtures();
  console.log(`wrote ${ids.length} fixture runs:\n  ${ids.join("\n  ")}`);
  await close();
}
