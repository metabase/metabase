/**
 * Helpers for the transforms-inspect spec port
 * (e2e/test/scenarios/data-studio/transforms/transforms-inspect.cy.spec.ts).
 *
 * The transform *inspector*: after a transform has run, `/data-studio/
 * transforms/:id/inspect` discovers a set of "lenses" (Data Summary, Column
 * Distributions, Join Analysis, and drill-down lenses such as Unmatched Rows)
 * and renders each as a tab of tree-tables and visualizations.
 *
 * TOKEN TIER — PROBED, NOT ASSUMED.
 * ---------------------------------
 * The local `MB_PRO_SELF_HOSTED_TOKEN` does NOT carry `transforms-basic`
 * (measured: 42 features on, `transforms-basic: false`, `transforms-python:
 * true`). That is genuinely absent — but it does **not** gate this spec, and
 * the reason is worth writing down because the naive reading says it should.
 *
 *   `check-feature-enabled` (src/metabase/transforms/util.clj:37) sends query
 *   transforms to `premium-features/query-transforms-enabled?`
 *   (src/metabase/premium_features/token_check.clj:715), which is:
 *
 *       (and (setting/get :transforms-enabled)
 *            (or (not (is-hosted?))
 *                (has-feature? :transforms-basic)))
 *
 *   The slot backend reports `is-hosted? = false`, so the `or` short-circuits
 *   on its FIRST branch and `transforms-basic` is never consulted. The
 *   docstring says so outright: "Available on any non-hosted instance (OSS
 *   intentionally gets query transforms without a license)".
 *
 * Every transform in this spec is MBQL or SQL — there is no python transform —
 * so the whole file runs on the missing feature. Confirmed end-to-end against
 * :4103 before a line of it was written: create → run (`succeeded`) →
 * `GET /api/ee/transforms/:id/inspect` → **200** with
 * `available_lenses: [generic-summary, column-comparison]`. No 402 anywhere.
 *
 * QA-DATABASE TIER. Upstream is `@external`: it restores the
 * `postgres-writable` snapshot, resets the `many_schemas` test table and drives
 * WRITABLE_DB_ID (the writable QA postgres on :5404). Gated on
 * PW_QA_DB_ENABLED, and — like the sibling transforms port and unlike most
 * QA-DB ports — it EXECUTES when the gate is on. A green run with everything
 * skipped is the failure mode, not the goal (FINDINGS #49).
 *
 * New module (PORTING rule 9). Shared support modules are imported read-only
 * and never edited: the transform CRUD helpers come from `transforms.ts` /
 * `dependency-graph.ts`, the `many_schemas` reset from `transforms-codegen.ts`,
 * and the writable-DB constants from `schema-viewer.ts`. Only what has no
 * counterpart there lives here.
 */
import { type Page, expect } from "@playwright/test";
import type { Response } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { createTransform, runTransformAndWaitForSuccess } from "./dependency-graph";
import { WRITABLE_DB_ID, getTableId } from "./schema-viewer";
// H.waitForSucceededTransformRuns — already ported (and exercised) by the
// sibling transforms spec; imported read-only rather than duplicated here.
import { waitForSucceededTransformRuns } from "./transforms";
import { writableDbConfig } from "./writable-db";

// ---------------------------------------------------------------------------
// Constants (verbatim from the spec header)
// ---------------------------------------------------------------------------

export const SOURCE_TABLE = "Animals";
export const TARGET_SCHEMA = "Schema A";
export const JOIN_SCHEMA = "Schema B";

export const QA_DB_SKIP_REASON =
  "Requires the writable postgres QA container + the postgres-writable snapshot (set PW_QA_DB_ENABLED)";

// ---------------------------------------------------------------------------
// Writable-DB fixtures
// ---------------------------------------------------------------------------

// Connection facts live in support/writable-db.ts, which resolves this
// worker's own writable database (writable_db_w<slot>) when per-worker
// isolation is on.
//
// transforms-codegen.ts owns the `many_schemas` reset; `no_pk_table` has no
// counterpart there.

type KnexClient = {
  schema: {
    dropTableIfExists(table: string): Promise<unknown>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createTable(table: string, cb: (t: any) => void): Promise<unknown>;
  };
  (tableName: string): { insert(rows: Record<string, unknown>[]): Promise<unknown> };
  destroy(): Promise<void>;
};

function knexClient(): KnexClient {
  // Lazy require: `knex`/`pg` are not dependencies of this package, so the
  // module must still load with the QA gate off and the drivers absent.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Knex = require("knex") as (config: unknown) => KnexClient;
  return Knex(writableDbConfig("postgres"));
}

/**
 * Port of H.resetTestTable({ type: "postgres", table: "no_pk_table" })
 * (cy.task("resetTable") → e2e/support/test_tables.js `no_pk_table`).
 *
 * Six rows in the DEFAULT schema, no primary key. The row set is load-bearing
 * for the two unmatched-rows tests and is reproduced exactly: joined to
 * `"Schema A"."Animals"` (Duck/Horse/Cow) on `name`, three of the six rows
 * match and three do not — 50% unmatched, which clears the inspector's >20%
 * alert threshold and yields the "3 rows" sample count the spec asserts.
 */
export async function resetNoPkTable() {
  const client = knexClient();
  try {
    await client.schema.dropTableIfExists("no_pk_table");
    await client.schema.createTable("no_pk_table", (t) => {
      t.string("name");
      t.integer("score");
    });
    await client("no_pk_table").insert([
      { name: "Duck", score: 10 },
      { name: "Horse", score: 20 },
      { name: "Cow", score: 30 },
      { name: "Pig", score: 40 },
      { name: "Chicken", score: 50 },
      { name: "Rabbit", score: 60 },
    ]);
  } finally {
    await client.destroy();
  }
}

/**
 * Drop the physical tables this spec's transforms write into.
 *
 * No counterpart in the Cypress original, and the same reasoning as
 * `resetTransformTargetTables` in transforms.ts: the "already exists" guard is
 * a PHYSICAL check against the warehouse, and the app-DB snapshot restore in
 * the beforeEach cannot touch it. Upstream tolerates the residue because CI
 * provisions the writable container fresh per job; the local container is
 * long-lived and shared across sessions and agents.
 *
 * Deliberately narrow — only the `inspect_%` targets this spec creates, and
 * only in `Schema A`. It must NOT drop foreign schemas or sibling slots'
 * tables (#85: siblings live in the same container).
 */
export async function resetInspectTargetTables() {
  const client = knexClient();
  try {
    for (const table of [
      "inspect_prerun_table",
      "inspect_mbql_table",
      "inspect_join_table",
      "inspect_join_tree_table",
      "inspect_unmatched_table",
      "inspect_coldist_table",
      "inspect_loading_table",
      "inspect_sql_table",
    ]) {
      await client.schema.dropTableIfExists(`${TARGET_SCHEMA}.${table}`);
    }
  } finally {
    await client.destroy();
  }
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

/** Port of H.DataStudio.Transforms.visitInspect (e2e-data-studio-helpers.ts:49). */
export const visitInspect = (page: Page, transformId: number) =>
  page.goto(`/data-studio/transforms/${transformId}/inspect`);

// ---------------------------------------------------------------------------
// Transform creation
// ---------------------------------------------------------------------------

type TestQuerySpec = {
  database: number;
  stages: unknown[];
};

/**
 * Port of H.createTestQuery (e2e/support/helpers/api/createTestQuery.ts):
 * POST the MBQL5 test-query spec to /api/testing/query and resolve with the
 * compiled dataset_query.
 */
export async function createTestQuery(
  api: MetabaseApi,
  querySpec: TestQuerySpec,
): Promise<Record<string, unknown>> {
  const response = await api.post("/api/testing/query", querySpec);
  return (await response.json()) as Record<string, unknown>;
}

/**
 * Port of H.createMbqlTransform (e2e-transform-helpers.ts:77). The `limit: 5`
 * is upstream's, not an addition — kept because the row-count assertions in the
 * generic-summary test read the resulting table (Animals has 3 rows, so the
 * limit does not bind, but dropping it would still be drift).
 */
export async function createMbqlTransform(
  api: MetabaseApi,
  opts: {
    sourceTable: string;
    sourceSchema?: string | null;
    targetTable: string;
    targetSchema: string | null;
    name: string;
  },
): Promise<{ id: number }> {
  const { sourceTable, sourceSchema, targetTable, targetSchema, name } = opts;

  const tableId = await getTableId(api, {
    name: sourceTable,
    schema: sourceSchema ?? undefined,
  });

  return createTransform(api, {
    name,
    source: {
      type: "query",
      query: {
        database: WRITABLE_DB_ID,
        type: "query",
        query: { "source-table": tableId, limit: 5 },
      },
    },
    target: {
      type: "table",
      database: WRITABLE_DB_ID,
      name: targetTable,
      schema: targetSchema,
    },
  });
}

/** Port of H.createAndRunMbqlTransform (e2e-transform-helpers.ts:273). */
export async function createAndRunMbqlTransform(
  api: MetabaseApi,
  opts: {
    sourceTable: string;
    sourceSchema?: string | null;
    targetTable: string;
    targetSchema: string | null;
    name: string;
  },
): Promise<{ transformId: number }> {
  const { id } = await createMbqlTransform(api, opts);
  await runTransformAndWaitForSuccess(api, id);
  return { transformId: id };
}

/** Port of H.createAndRunSqlTransform (e2e-transform-helpers.ts:295). */
export async function createAndRunSqlTransform(
  api: MetabaseApi,
  opts: {
    name: string;
    sourceQuery: string;
    targetTable: string;
    targetSchema: string | null;
  },
): Promise<{ transformId: number }> {
  const { name, sourceQuery, targetTable, targetSchema } = opts;
  const { id } = await createTransform(api, {
    name,
    source: {
      type: "query",
      query: {
        database: WRITABLE_DB_ID,
        type: "native",
        native: { query: sourceQuery },
      },
    },
    target: {
      type: "table",
      database: WRITABLE_DB_ID,
      name: targetTable,
      schema: targetSchema,
    },
  });
  await runTransformAndWaitForSuccess(api, id);
  return { transformId: id };
}

/**
 * Port of the spec-local createAndRunMbqlJoinTransform
 * (transforms-inspect.cy.spec.ts:422). Upstream's comment: "This transform with
 * 50% unmatched rows triggers >20% alert and drill lens".
 *
 * Note the upstream asymmetry, reproduced verbatim: `sourceSchema` is a
 * required parameter threaded into `getTableId`, but the transform TARGET is
 * hardcoded to TARGET_SCHEMA regardless. The unmatched-rows tests rely on that
 * — they pass `sourceSchema: undefined` (no_pk_table lives in the default
 * schema) while still writing the output into "Schema A".
 */
export async function createAndRunMbqlJoinTransform(
  page: Page,
  api: MetabaseApi,
  opts: {
    name: string;
    targetTable: string;
    sourceTable?: string;
    sourceSchema: string | undefined;
    joinTable?: string;
    joinSchema?: string;
    joinStrategy?: string;
  },
): Promise<void> {
  const {
    name,
    targetTable,
    sourceTable = SOURCE_TABLE,
    sourceSchema,
    joinTable = SOURCE_TABLE,
    joinSchema = JOIN_SCHEMA,
    joinStrategy = "inner-join",
  } = opts;

  // H.cypressWaitAll([...]) — two independent lookups, resolved together.
  const [sourceTableId, joinTableId] = await Promise.all([
    getTableId(api, { name: sourceTable, schema: sourceSchema }),
    getTableId(api, { name: joinTable, schema: joinSchema }),
  ]);

  const query = await createTestQuery(api, {
    database: WRITABLE_DB_ID,
    stages: [
      {
        source: { type: "table", id: sourceTableId },
        joins: [
          {
            source: { type: "table", id: joinTableId },
            strategy: joinStrategy,
            conditions: [
              {
                operator: "=",
                left: { type: "column", name: "name" },
                right: { type: "column", name: "name" },
              },
            ],
          },
        ],
      },
    ],
  });

  const { id } = await createTransform(api, {
    name,
    source: { type: "query", query },
    target: {
      type: "table",
      database: WRITABLE_DB_ID,
      name: targetTable,
      schema: TARGET_SCHEMA,
    },
  });

  // Upstream fires POST /run and then waits on the RUNS LIST reporting success
  // (H.waitForSucceededTransformRuns), not on the run row — reproduced by
  // polling the same endpoint the helper polls.
  await api.post(`/api/transform/${id}/run`);
  await waitForSucceededTransformRuns(api);

  await visitInspect(page, id);
}

// ---------------------------------------------------------------------------
// Inspector response queues (port of the beforeEach cy.intercept aliases)
// ---------------------------------------------------------------------------

/**
 * `cy.wait("@alias")` is a QUEUE, not a barrier: it pops the next UNCONSUMED
 * response and is satisfiable retroactively by a response that already landed.
 * Several tests here wait on `@inspectorLens` twice in a row, and the first of
 * those waits routinely resolves against a response fired during page load —
 * before the line that "triggers" it. A `waitForResponse` registered at the
 * call site would hang there, so the queue is ported rather than approximated.
 *
 * Install once per test, BEFORE the first navigation.
 */
type ResponseQueue = { responses: Response[]; consumed: number };

const discoveryQueues = new WeakMap<Page, ResponseQueue>();
const lensQueues = new WeakMap<Page, ResponseQueue>();

/** GET /api/ee/transforms/{*}/inspect — the discovery call, no lens segment. */
function isDiscovery(response: Response): boolean {
  return (
    response.request().method() === "GET" &&
    /\/api\/ee\/transforms\/[^/]+\/inspect(?:\?|$)/.test(response.url())
  );
}

/** GET /api/ee/transforms/{*}/inspect/{*} — a single lens's contents. */
function isLens(response: Response): boolean {
  return (
    response.request().method() === "GET" &&
    /\/api\/ee\/transforms\/[^/]+\/inspect\/[^/?]+(?:\?|$)/.test(response.url())
  );
}

/**
 * Port of the two beforeEach aliases:
 *   cy.intercept("GET", "/api/ee/transforms/(*)/inspect").as("inspectorDiscovery")
 *   cy.intercept("GET", "/api/ee/transforms/(*)/inspect/(*)").as("inspectorLens")
 *
 * Cypress's glob `*` does not cross `/`, so the two patterns are disjoint —
 * `/inspect/generic-summary` matches only `@inspectorLens`. The regexes above
 * preserve that: `isDiscovery` requires `inspect` to END the path.
 */
export function recordInspectorResponses(page: Page) {
  const discovery: ResponseQueue = { responses: [], consumed: 0 };
  const lens: ResponseQueue = { responses: [], consumed: 0 };
  discoveryQueues.set(page, discovery);
  lensQueues.set(page, lens);
  page.on("response", (response) => {
    if (isDiscovery(response)) {
      discovery.responses.push(response);
    } else if (isLens(response)) {
      lens.responses.push(response);
    }
  });
}

async function popNext(
  queue: ResponseQueue | undefined,
  alias: string,
): Promise<Response> {
  if (!queue) {
    throw new Error(`recordInspectorResponses(page) was never installed`);
  }
  await expect
    .poll(() => queue.responses.length, {
      timeout: 30_000,
      message: `waiting for @${alias} (consumed ${queue.consumed})`,
    })
    .toBeGreaterThan(queue.consumed);
  return queue.responses[queue.consumed++];
}

/** Port of cy.wait("@inspectorDiscovery"). */
export const waitForInspectorDiscovery = (page: Page) =>
  popNext(discoveryQueues.get(page), "inspectorDiscovery");

/** Port of cy.wait("@inspectorLens"). */
export const waitForInspectorLens = (page: Page) =>
  popNext(lensQueues.get(page), "inspectorLens");
