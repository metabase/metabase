/**
 * Spec-local helpers for the Playwright port of
 * e2e/test/scenarios/question/query-external.cy.spec.js.
 *
 * Own module per PORTING rule 9 — nothing here edits a shared support file.
 * `openTableNotebookInDb` and `visualize` are imported read-only by the spec
 * from support/question-notebook.ts and support/notebook.ts respectively.
 */
import type { MetabaseApi } from "./api";

export const QA_DB_SKIP_REASON =
  "Requires the QA Mongo / MySQL8 containers and their mongo-5 / mysql-8 " +
  "snapshots (set PW_QA_DB_ENABLED)";

/**
 * Port of the spec's `cy.request("/api/database/:id/schema/")` aliased as
 * `@schema`, plus the `body.find(t => t.name.toLowerCase() === "orders").id`
 * lookup the single test performs on it.
 *
 * Note the trailing slash: the endpoint is `/api/database/:id/schema/:schema`
 * with an EMPTY schema name, which is what both the Mongo and the MySQL QA
 * databases sync their tables into. Upstream aliases the request in
 * `beforeEach` and dereferences it inside the test; there is no ordering
 * subtlety to preserve (a `cy.request` alias is a plain value, not a network
 * queue), so the port issues it where the value is used.
 *
 * `.find(...)` returning `undefined` would upstream throw a TypeError on
 * `.id`; here it is turned into an explicit error so a sync/naming change
 * fails with a readable fingerprint rather than "cannot read property id".
 */
export async function getTableIdByName(
  api: MetabaseApi,
  databaseId: number,
  tableName: string,
): Promise<number> {
  const response = await api.get(`/api/database/${databaseId}/schema/`);
  const tables = (await response.json()) as { id: number; name: string }[];
  const match = tables.find(
    (table) => table.name.toLowerCase() === tableName.toLowerCase(),
  );
  if (!match) {
    throw new Error(
      `No table named "${tableName}" in database ${databaseId}; got: ${tables
        .map((table) => table.name)
        .join(", ")}`,
    );
  }
  return match.id;
}
