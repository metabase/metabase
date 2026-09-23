/**
 * Writer for the search-comparison harness results store (`hackathon/harness/01-contracts.md` §4).
 *
 * The store is a separate Postgres database (`harness`, in the pgvector container) that the local
 * Metabase instance reads as a *warehouse*; it is never the app DB. Schema: `../sql/01-schema.sql`.
 *
 * Runs are append-only: `startRun` always mints a new run id, and nothing here updates or deletes an
 * existing run's observations.
 *
 *   const runId = await startRun({ dataScale: 100, corpusId: "golden-v1", gitSha, branch, notes });
 *   await recordScenarios(runId, scenarios);        // §3 shape, the labels this run is scored against
 *   await recordQueryResults(runId, rows);          // batched
 *   await recordMetrics(runId, metricRows);         // long format
 *   await finishRun(runId);
 *   await close();                                  // end the pool when the process is done
 */
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";

import pg from "pg";

import type { MetricRow, QueryResultRow, RunInfo, Scenario } from "../../shared/types.ts";

export type { MetricRow, QueryResultRow, ReturnedItem, RunInfo, Scenario } from "../../shared/types.ts";

export const DEFAULT_URL = "postgres://postgres:postgres@localhost:55432/harness";

const BATCH_SIZE = 500;

let pool: pg.Pool | undefined;

/** The shared pool. Override the target with `HARNESS_DB_URL`. */
export function getPool(): pg.Pool {
  pool ??= new pg.Pool({ connectionString: process.env.HARNESS_DB_URL ?? DEFAULT_URL, max: 4 });
  return pool;
}

export async function close(): Promise<void> {
  await pool?.end();
  pool = undefined;
}

// ---------------------------------------------------------------------------------------------------

function newRunId(): string {
  const ts = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  return `${ts}-${randomUUID().slice(0, 6)}`;
}

/** Run `fn` on one pooled client inside BEGIN/COMMIT, rolling back if it throws. */
async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** Multi-row INSERT in batches of `BATCH_SIZE` rows on `client`. Columns in `jsonb` get a `::jsonb` cast. */
async function insertBatched(client: pg.PoolClient, table: string, columns: string[], rows: unknown[][], jsonb: string[] = []) {
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const batch = rows.slice(start, start + BATCH_SIZE);
    const values = batch.map(
      (_, r) => `(${columns.map((c, i) => `$${r * columns.length + i + 1}${jsonb.includes(c) ? "::jsonb" : ""}`).join(", ")})`,
    );
    await client.query(`INSERT INTO ${table} (${columns.join(", ")}) VALUES ${values.join(", ")}`, batch.flat());
  }
  return rows.length;
}

// ---------------------------------------------------------------------------------------------------
// Runs

/** Insert a new `harness_run` row and return its id. Never reuses an id. */
export async function startRun(info: RunInfo): Promise<string> {
  const runId = newRunId();
  await getPool().query(
    `INSERT INTO harness_run (run_id, started_at, git_sha, branch, data_scale, corpus_id, host, notes, embedding_text, embedder,
                              text_strategy, job_id)
     VALUES ($1, now(), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [runId, info.gitSha ?? null, info.branch ?? null, info.dataScale ?? null, info.corpusId ?? null,
      info.host ?? hostname(), info.notes ?? null, info.embeddingText ?? "baseline", info.embedder ?? null,
      info.textStrategy ?? "none", info.jobId ?? null],
  );
  return runId;
}

/** Stamp `finished_at`. The data app only shows finished runs. */
export async function finishRun(runId: string): Promise<void> {
  await getPool().query(
    "UPDATE harness_run SET finished_at = now() WHERE run_id = $1 AND finished_at IS NULL",
    [runId],
  );
}

/** Merge `patch` into the run's `notes` JSON (top-level keys; the patch wins). For facts known only after the run. */
export async function updateRunNotes(runId: string, patch: Record<string, unknown>): Promise<void> {
  await getPool().query(
    "UPDATE harness_run SET notes = (coalesce(notes, '{}')::jsonb || $2::jsonb)::text WHERE run_id = $1",
    [runId, JSON.stringify(patch)],
  );
}

// ---------------------------------------------------------------------------------------------------
// Scenarios

/**
 * Record the §3 scenarios (labels) a run was scored against. Labels are per run because entity ids differ
 * per instance; the corpus id is taken from the run. Idempotent on (run_id, scenario_id).
 */
export async function recordScenarios(runId: string, scenarios: Scenario[]): Promise<number> {
  await withTransaction(async (client) => {
    const { rows: [run] } = await client.query("SELECT corpus_id FROM harness_run WHERE run_id = $1", [runId]);
    if (run === undefined) {
      throw new Error(`run ${runId} does not exist; call startRun first`);
    }
    for (const s of scenarios) {
      await client.query(
        `INSERT INTO harness_scenario (run_id, corpus_id, scenario_id, query, tags, lang, expected, expected_absent, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)
         ON CONFLICT (run_id, scenario_id) DO UPDATE SET
           query = EXCLUDED.query, tags = EXCLUDED.tags, lang = EXCLUDED.lang, expected = EXCLUDED.expected,
           expected_absent = EXCLUDED.expected_absent, notes = EXCLUDED.notes`,
        [runId, run.corpus_id, s.id, s.query, [...s.tags].sort(), s.lang ?? null,
          JSON.stringify(s.expected ?? []), s.expectedAbsent ? JSON.stringify(s.expectedAbsent) : null,
          s.notes ?? null],
      );
    }
  });
  return scenarios.length;
}

// ---------------------------------------------------------------------------------------------------
// Observations and metrics

const QUERY_RESULT_COLUMNS = [
  "run_id", "engine", "embedder", "dimensions", "scenario_id", "iteration", "latency_ms", "embed_ms",
  "store_ms", "filter_ms", "result_count", "raw_count", "returned", "error",
];

/**
 * Batch-insert raw observations for `runId`. Returns the number of rows written.
 *
 * Enforces one embedder per run (§5.2): the first batch stamps `harness_run.embedder` (unless `startRun`
 * already set it), and a batch naming any other embedder is rejected before anything is written.
 */
export async function recordQueryResults(runId: string, rows: QueryResultRow[]): Promise<number> {
  if (rows.length === 0) {
    return 0;
  }
  const embedders = [...new Set(rows.map((r) => r.embedder))];
  if (embedders.length > 1) {
    throw new Error(`run ${runId}: one embedder per run (§5.2), got ${embedders.join(", ")}`);
  }
  return withTransaction(async (client) => {
    const { rows: [run] } = await client.query(
      "UPDATE harness_run SET embedder = coalesce(embedder, $2) WHERE run_id = $1 RETURNING embedder",
      [runId, embedders[0]],
    );
    if (run === undefined) {
      throw new Error(`run ${runId} does not exist; call startRun first`);
    }
    if (run.embedder !== embedders[0]) {
      throw new Error(`run ${runId} is for embedder ${run.embedder}, not ${embedders[0]} (§5.2)`);
    }
    return insertBatched(
      client,
      "harness_query_result",
      QUERY_RESULT_COLUMNS,
      rows.map((r) => [
        runId, r.engine, r.embedder, r.dimensions ?? null, r.scenarioId, r.iteration, r.latencyMs ?? null,
        r.embedMs ?? null, r.storeMs ?? null, r.filterMs ?? null, r.resultCount ?? null, r.rawCount ?? null,
        r.returned == null
          ? null
          : JSON.stringify(r.returned.map(({ model, id, name, score }) => ({ model, id, name, score }))),
        r.error == null ? null : r.error instanceof Error ? `${r.error.name}: ${r.error.message}` : String(r.error),
      ]),
      ["returned"],
    );
  });
}

const METRIC_COLUMNS = ["run_id", "engine", "engine_b", "embedder", "scenario_id", "tag", "metric", "value"];

/** Batch-insert long-format metric rows for `runId`. Rows without a value are skipped. */
export async function recordMetrics(runId: string, rows: MetricRow[]): Promise<number> {
  return withTransaction((client) => insertBatched(
    client,
    "harness_metric",
    METRIC_COLUMNS,
    rows
      .filter((r) => r.value != null && Number.isFinite(r.value))
      .map((r) => [runId, r.engine, r.engineB ?? null, r.embedder, r.scenarioId ?? null,
        r.tag ?? null, r.metric, r.value]),
  ));
}
