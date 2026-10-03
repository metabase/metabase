/**
 * Spec-local helpers for the Playwright port of
 * e2e/test/scenarios/dashboard-filters/dashboard-filters-sql-text-category.cy.spec.js
 *
 * Lives in its own module so shared support files stay untouched (rule 9).
 * Everything else the spec needs is imported read-only from the shared
 * modules: setFilter / saveDashboard / filterWidget / getDashboardCard /
 * editDashboard (dashboard.ts), createNativeQuestion /
 * createNativeQuestionAndDashboard (factories.ts), the visualizer modal
 * helpers (visualizer-basics.ts), dashboardParametersDoneButton
 * (filters-repros-2.ts), dashboardParametersPopover (dashboard-core.ts),
 * popover/modal (ui.ts), and queryQaDB (collections-uploads.ts).
 */
import type { MetabaseApi } from "./api";
import { queryQaDB } from "./collections-uploads";

/**
 * The spec's own `const PG_DB_ID = 2`. Under the `postgres-12` snapshot
 * database 2 is the read-only "QA Postgres12" sample (database `sample` on
 * :5404) — NOT the `writable_db` container — so this spec does not touch the
 * never-reset writable warehouse.
 *
 * ⚠️ It DOES write to the shared QA `sample` database (see queryQADB below).
 */
export const PG_DB_ID = 2;

export const QA_DB_SKIP_REASON =
  "Requires the QA Postgres12 container and its postgres-12 snapshot (set PW_QA_DB_ENABLED)";

/**
 * Port of H.queryQADB(query) — `cy.task("connectAndQueryDB", { connectionConfig:
 * QA_DB_CONFIG.postgres, query })`. QA_DB_CONFIG.postgres is QA_DB_CREDENTIALS
 * (metabase/metasample123, database `sample`, ssl false) on QA_POSTGRES_PORT
 * (5404) — exactly the connection `queryQaDB(query, "postgres", "sample")`
 * builds, so this is a thin read-only alias rather than a second knex config.
 *
 * 🔴 The QA `sample` container is SHARED between parallel slots. This spec
 * mutates it (Doohickey → New Category) for the duration of one test and
 * reverts in afterEach. That window is visible to any other slot querying
 * database 2 concurrently. Upstream has the same property but Cypress runs the
 * file serially. Nothing in the port can fix this; see findings.
 */
export function queryQADB(query: string) {
  return queryQaDB(query, "postgres", "sample");
}

/**
 * Port of H.getTableId({ databaseId = WRITABLE_DB_ID, name, schema })
 * (e2e/support/helpers/e2e-qa-databases-helpers.js). The Cypress default is
 * WRITABLE_DB_ID, which is the literal 2 — under the `postgres-12` snapshot
 * restored here that is the QA Postgres12 sample, i.e. the same database as
 * this spec's PG_DB_ID. The default is reproduced rather than "corrected" so
 * the resolution is identical.
 */
export async function getTableId(
  api: MetabaseApi,
  {
    databaseId = PG_DB_ID,
    name,
    schema,
  }: { databaseId?: number; name: string; schema?: string },
): Promise<number> {
  const response = await api.get("/api/table");
  const tables = (await response.json()) as {
    id: number;
    db_id: number;
    name: string;
    schema: string;
  }[];
  const table = tables.find(
    (candidate) =>
      candidate.db_id === databaseId &&
      candidate.name === name &&
      (schema ? candidate.schema === schema : true),
  );
  if (!table) {
    throw new TypeError(`Table with name ${name} cannot be found`);
  }
  return table.id;
}

/** Port of H.getFieldId({ tableId, name }). */
export async function getFieldId(
  api: MetabaseApi,
  { tableId, name }: { tableId: number; name: string },
): Promise<number> {
  const response = await api.get(`/api/table/${tableId}/query_metadata`);
  const table = (await response.json()) as {
    fields?: { id: number; name: string }[];
  };
  const field = (table.fields ?? []).find(
    (candidate) => candidate.name === name,
  );
  if (!field) {
    throw new TypeError(`Field with name ${name} cannot be found`);
  }
  if (typeof field.id !== "number") {
    throw new TypeError("Unexpected non-integer field id.");
  }
  return field.id;
}

/** The spec's `sqlQueryDetails`, byte-for-byte (indentation included). */
export const SQL_QUERY_DETAILS = `SELECT
  PRODUCTS.CATEGORY,
  SUM(TOTAL) AS TOTAL
FROM ORDERS
LEFT JOIN PRODUCTS on ORDERS.PRODUCT_ID = PRODUCTS.ID
WHERE {{field}}
GROUP BY PRODUCTS.CATEGORY`;
