/**
 * Helpers for the transforms-indexes spec port
 * (e2e/test/scenarios/data-studio/transforms/transforms-indexes.cy.spec.ts).
 *
 * INDEX MANAGER. A transform's target table can carry indexes from two
 * independent sources, and the Indexes tab shows them MERGED:
 *
 *   - MANAGED   — a row in `metabase_table_indexes` created via
 *                 `POST /api/index/request`. Carries a `:status`
 *                 (create-pending / update-pending / delete-pending / running /
 *                 succeeded / failed) which the FE maps to the visible labels
 *                 Pending / Removing / Running / Succeeded / Failed
 *                 (TransformIndexTable/utils.ts `formatStatus`).
 *   - UNMANAGED — an index that physically exists in the warehouse with no
 *                 Metabase request behind it (e.g. a DBA ran CREATE INDEX).
 *                 It has no request, so `formatStatus(undefined)` renders
 *                 EMPTY_CELL_PLACEHOLDER, which is the em dash "—".
 *
 * `metabase.indexes.reconcile/merge-indexes` unions the two; the `Source`
 * column is "Managed" / "Unmanaged" accordingly. A managed request is only
 * physically applied on the next transform RUN — that is why the lifecycle
 * test creates the index, sees Pending, runs the transform, and only then
 * sees Succeeded plus a real `pg_indexes` row.
 *
 * ======================== TOKEN TIER — TRACED, NOT ASSUMED ==================
 * The queue tags this spec `token` and the upstream beforeEach calls
 * `H.activateToken("pro-self-hosted")`. Two separate questions were traced.
 *
 * 1. THE INDEX API ITSELF IS NOT GATED AT ALL. `src/metabase/indexes_rest/api.clj`
 *    (GET "/", GET/POST/PUT/DELETE "/request/:id") contains NO
 *    `check-feature-enabled!`, no `premium-features` require, and no
 *    `api/check-superuser`. Its only authorization is
 *    `api/read-check`/`api/write-check` on the OWNING TRANSFORM — read the
 *    transform, mutate the transform. Read the whole namespace; the word
 *    "premium" does not appear in it.
 *
 * 2. THE TRANSFORM CREATE IS GATED, BUT SHORT-CIRCUITS.
 *    `transforms_rest/api/transform.clj:179` calls
 *    `transforms.core/check-feature-enabled!`, which for a `query` source
 *    (this spec creates MBQL transforms only) routes to
 *    `premium-features/query-transforms-enabled?`:
 *
 *        (and (setting/get :transforms-enabled)
 *             (or (not (is-hosted?)) (has-feature? :transforms-basic)))
 *
 *    `is-hosted?` is false on this box, so the `or` short-circuits and the
 *    absent `:transforms-basic` feature is never consulted. (The python arm,
 *    `python-transforms-enabled?`, has no such short-circuit — but this spec
 *    creates no python transform, so that branch is INAPPLICABLE here.)
 *
 * 3. THE FE ROUTE IS NOT PLUGIN-GATED. `frontend/src/metabase/transforms/routes.tsx`
 *    registers `:transformId/indexes` unconditionally (contrast the
 *    `PLUGIN_DEPENDENCIES.isEnabled` / `PLUGIN_TRANSFORMS_PYTHON` siblings on
 *    the same switchboard), and `TransformTabs.tsx` pushes the "Indexes" tab
 *    unconditionally too.
 *
 * Prediction from the trace: `activateToken` is a RED HERRING for this file.
 * That prediction was then falsified-or-confirmed by a real two-arm control
 * run rather than left as reasoning — see findings-inbox/transforms-indexes.md.
 * The token call is nevertheless KEPT in the port (faithfulness: upstream runs
 * it, and a token-off port would silently diverge if the gating ever moves).
 * ===========================================================================
 *
 * QA-DATABASE TIER. Restores `postgres-writable`, resets `many_schemas`, and
 * drives WRITABLE_DB_ID (writable postgres on :5404) both through the app and
 * directly over `pg`. Gated on PW_QA_DB_ENABLED, at DESCRIBE level rather than
 * in the beforeEach because the describe has an afterEach.
 *
 * New module (PORTING rule 9), named to match the spec basename exactly.
 * Shared support modules are imported read-only and never edited.
 */
import type { Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { DataStudio } from "./transforms";

// ---------------------------------------------------------------------------
// Constants (verbatim from the spec header)
// ---------------------------------------------------------------------------

export const SOURCE_TABLE = "Animals";
export const TARGET_SCHEMA = "Schema A";

export const INDEX_TABLE_COLUMNS = [
  "Name",
  "Type",
  "Columns",
  "Source",
  "Status",
  "Last modified by",
  "Last run",
];

/**
 * The two physical target tables this spec's transforms write into.
 *
 * These literals are upstream's own (`indexes_list_table` at :32 and
 * `indexes_lifecycle_table` at :91) and are kept UNCHANGED — grepped across
 * `e2e/` and `e2e-playwright/` and they appear nowhere else, so there is no
 * live-sibling collision to design around. Note in particular that neither
 * contains the substring "transform", so `support/transforms.ts`
 * `resetTransformTargetTables()` (which drops `LIKE '%transform%'` in
 * Schema A/B/Domestic/Wild/public) cannot reach them — which is good for
 * isolation and bad for cleanup, hence the helper below.
 */
export const LIST_TARGET_TABLE = "indexes_list_table";
export const LIFECYCLE_TARGET_TABLE = "indexes_lifecycle_table";

export const QA_DB_SKIP_REASON =
  "Requires the writable postgres QA container + the postgres-writable snapshot (set PW_QA_DB_ENABLED)";

// ---------------------------------------------------------------------------
// Writable-DB access
// ---------------------------------------------------------------------------

// Writable-postgres connection facts from e2e/support/cypress_data.js
// (WRITABLE_DB_CONFIG.postgres). Duplicated rather than imported because
// `support/schema-viewer.ts` keeps its copy private, and shared support
// modules are not editable from here.
const WRITABLE_PG_CONFIG = {
  host: "localhost",
  user: "metabase",
  password: "metasample123",
  database: "writable_db",
  port: 5404,
  ssl: false,
};

type PgClient = {
  connect(): Promise<void>;
  query(sql: string): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<void>;
};

function pgClient(): PgClient {
  // Lazy require: `pg` is not a dependency of this package (it resolves from
  // the repo root node_modules, the same driver the Cypress db tasks use), so
  // the module must still load with the QA gate off and the driver absent.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Client } = require("pg") as {
    Client: new (config: Record<string, unknown>) => PgClient;
  };
  return new Client(WRITABLE_PG_CONFIG);
}

/**
 * Port of `H.queryWritableDB(sql, "postgres")` — ROW-RETURNING.
 *
 * `support/schema-viewer.ts` already exports a `queryWritableDB`, but it is
 * typed `Promise<void>` and DISCARDS the result set. The lifecycle test's
 * strongest assertion is `.then(({ rows }) => expect(rows).to.have.length(1))`
 * over a `pg_indexes` SELECT, so a row-returning variant is required. Editing
 * the shared module to widen its return type is not permitted here, so this is
 * a local variant rather than a change to the shared one. Same connection
 * facts, same driver, same lazy-require discipline.
 */
export async function queryWritableDBRows(
  sql: string,
): Promise<Record<string, unknown>[]> {
  const client = pgClient();
  await client.connect();
  try {
    const { rows } = await client.query(sql);
    return rows;
  } finally {
    await client.end();
  }
}

/** Fire-and-forget variant, for the `CREATE INDEX` the spec runs as a DBA. */
export async function execWritableDB(sql: string): Promise<void> {
  await queryWritableDBRows(sql);
}

/**
 * ⚠️ NO UPSTREAM COUNTERPART — required by this harness, declared not smuggled.
 *
 * `POST /api/transform` hard-403s with "A table with that name already
 * exists." when the target table is already physically present
 * (`transforms_rest/api/transform.clj:183-185`, `target-table-exists?`). In
 * Cypress that never bites, because `H.restore("*-writable")` also invokes
 * `resetWritableDb` (e2e/support/db_tasks.js:41), which rebuilds the warehouse
 * from scratch. THIS HARNESS'S `mb.restore()` DOES NOT — it only restores the
 * app DB — and no port of `resetWritableDb` exists anywhere in
 * `e2e-playwright/`. So warehouse state accumulates across runs, and the
 * SECOND execution of this spec (or any `--repeat-each`) would 403 in the
 * beforeEach-adjacent fixture setup rather than in an assertion.
 *
 * This drops exactly the two tables this spec creates, by exact name, in
 * exactly one schema. It does NOT drop foreign schemas and does NOT use a LIKE
 * pattern — a sibling was bitten by precisely that kind of broad cleanup
 * racing another slot. Nothing is weakened: the target tables are fixtures,
 * never the subject of an assertion beyond their own indexes.
 */
export async function resetIndexesTargetTables(): Promise<void> {
  const client = pgClient();
  await client.connect();
  try {
    for (const table of [LIST_TARGET_TABLE, LIFECYCLE_TARGET_TABLE]) {
      await client.query(
        `DROP TABLE IF EXISTS "${TARGET_SCHEMA}"."${table}" CASCADE`,
      );
    }
  } finally {
    await client.end();
  }
}

// ---------------------------------------------------------------------------
// Index-request API (spec-local helpers, ported 1:1)
// ---------------------------------------------------------------------------

export type StructuredIndex = {
  kind: string;
  name: string;
  columns: { name: string }[];
};

/** Port of the spec-local `btreeIndex(name, columns)`. */
export function btreeIndex(name: string, columns: string[]): StructuredIndex {
  return {
    kind: "btree",
    name,
    columns: columns.map((column) => ({ name: column })),
  };
}

/**
 * Port of the spec-local `createIndexRequest()`.
 * Returns the created request (upstream reads `body.id` off it for the DELETE).
 */
export async function createIndexRequest(
  api: MetabaseApi,
  transformId: number,
  structured: StructuredIndex,
): Promise<{ id: number }> {
  const response = await api.post("/api/index/request", {
    transform_id: transformId,
    structured,
  });
  return (await response.json()) as { id: number };
}

/**
 * Port of upstream's inline `cy.request("DELETE", "/api/index/request/:id")`.
 * The endpoint does NOT drop the physical index — it flips the row to
 * `delete-pending`, which is what renders as "Removing". That is the whole
 * point of the second row's assertion in the list test.
 */
export async function deleteIndexRequest(
  api: MetabaseApi,
  requestId: number,
): Promise<void> {
  await api.fetch("DELETE", `/api/index/request/${requestId}`);
}

// ---------------------------------------------------------------------------
// Page objects
// ---------------------------------------------------------------------------

/** Port of the spec-local `indexesTable()`. */
export const indexesTable = (page: Page) =>
  page.getByRole("treegrid", { name: "Transform indexes" });

/**
 * Port of the spec-local `matchHeaderName(label)` — `new RegExp("^" + label)`.
 * Kept as a prefix regex rather than tightened to an exact string: the
 * columnheader's accessible name is computed from the whole `HeaderCell`
 * subtree, which also carries a sort affordance, so an anchored prefix is the
 * faithful (and the working) form.
 */
export const matchHeaderName = (label: string) => new RegExp(`^${label}`);

/**
 * Port of `H.DataStudio.Transforms.visitIndexes(id)` — a plain `cy.visit`.
 * `DataStudio.Transforms` in the shared `support/transforms.ts` has no
 * `visitIndexes`/`indexesTab` member, and that module is not editable from
 * here, so both live locally.
 */
export const visitIndexes = (page: Page, transformId: number) =>
  page.goto(`/data-studio/transforms/${transformId}/indexes`);

/** Port of `H.DataStudio.Transforms.indexesTab()`. */
export const indexesTab = (page: Page) =>
  DataStudio.Transforms.header(page).getByText("Indexes", { exact: true });

/** Port of `H.undoToast()`. */
export const undoToast = (page: Page) => page.getByTestId("toast-undo");

/** Port of the spec-local `indexesContent()` anchor (`transforms-indexes-content`). */
export const indexesContent = (page: Page) =>
  page.getByTestId("transforms-indexes-content");
