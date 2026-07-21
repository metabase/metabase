/**
 * Per-spec helpers for tests/sandboxing-misconfiguration.spec.ts — port of
 * e2e/test/scenarios/permissions/sandboxing/sandboxing-misconfiguration.cy.spec.ts
 * and the parts of helpers/e2e-sandboxing-helpers.ts that spec uses.
 *
 * Read-only reuse (porting rule 9 — no shared support module is edited):
 *  - support/sandboxing-via-ui.ts  → signInAs, assertRunningAs,
 *    assignAttributeToUser, configureSandboxPolicy, createUserFromRawData,
 *    assertUserGroupIds, getCardResponses, rowsShouldContainOnlyOneCategory,
 *    gizmoViewer and the USER_GROUPS ids. Those are exact ports of the same
 *    upstream helper file, so duplicating them here would be strictly worse.
 *  - support/schema-viewer.ts      → WRITABLE_DB_ID, queryWritableDB,
 *    getTableId, resyncDatabase.
 *  - support/table-collection-permissions.ts → blockUserGroupPermissions.
 *  - support/factories.ts          → createQuestion.
 *
 * ── What this file adds on top of sandboxing-via-ui ────────────────────────
 *
 * 1. `assertResponseFailsClosed` — the whole point of the spec, and the one
 *    helper sandboxing-via-ui does not port (it isn't used there).
 * 2. `setUpProductsTable` — this spec does NOT use the sample database. It
 *    builds a two-row `products` table in the writable QA postgres.
 * 3. `waitForSyncedField` — see its docstring; upstream's
 *    `resyncDatabase({ tableName })` is satisfied by a STALE table row.
 *
 * ── Auth, restated because it is the whole ballgame ────────────────────────
 *
 * Upstream's `signInAs` is `cy.request("POST", "/api/session")`, which in
 * Cypress makes every subsequent `cy.request` run as that user. Here the
 * imported `signInAs` routes the session POST through a THROWAWAY request
 * context, so `mb.api` stays admin and the returned client is the new user.
 * `assertRunningAs` pins that down at both ends — measured on this slot, not
 * inherited from the neighbouring spec's comment.
 */
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import { modifyPermission } from "./admin-permissions";
import type { MetabaseApi } from "./api";
import { saveChangesToPermissions } from "./command-palette";
import { createQuestion } from "./factories";
import { modal } from "./ui";
import {
  WRITABLE_DB_ID,
  getTableId,
  queryWritableDB,
  resyncDatabase,
} from "./schema-viewer";
import { blockUserGroupPermissions } from "./table-collection-permissions";
import {
  ALL_USERS_GROUP,
  COLLECTION_GROUP,
  READONLY_GROUP,
} from "./sandboxing-via-ui";

// Re-exported so the spec has ONE import source. Deliberately only what the
// spec consumes — the USER_GROUPS ids stay plain imports above, since this
// spec drives the sandboxed group by NAME ("data", via modifyPermission) and
// only ever needs the ids for the three blockUserGroupPermissions calls.
export {
  assertRunningAs,
  assertUserGroupIds,
  assignAttributeToUser,
  createUserFromRawData,
  getCardResponses,
  gizmoViewer,
  rowsShouldContainOnlyOneCategory,
  signInAs,
} from "./sandboxing-via-ui";
export { WRITABLE_DB_ID };

/**
 * Port of the `before` hook's three `H.blockUserGroupPermissions(group,
 * WRITABLE_DB_ID)` calls.
 *
 * ⚠️ The db id is NOT optional here. `blockUserGroupPermissions` defaults to
 * SAMPLE_DB_ID, and this spec never touches the sample database — a dropped
 * third argument would block the wrong database, leave the writable database
 * wide open to All Users, and the sandboxing assertion would still be green
 * for the wrong reason.
 */
export async function preparePermissions(api: MetabaseApi) {
  await blockUserGroupPermissions(api, ALL_USERS_GROUP, WRITABLE_DB_ID);
  await blockUserGroupPermissions(api, COLLECTION_GROUP, WRITABLE_DB_ID);
  await blockUserGroupPermissions(api, READONLY_GROUP, WRITABLE_DB_ID);
}

/**
 * Port of the `before` hook's "Create a simple editable products table".
 *
 * ⚠️ `writable_db` is SHARED across slots and is never reset by the harness.
 * These statements only touch this spec's own `public.products` and never a
 * foreign schema. Note `tests/question-reproductions.spec.ts` rebuilds the
 * same `public.products` table — the two must not run concurrently on
 * different slots. That hazard is pre-existing and shared, not introduced
 * here (it is the same table upstream drops).
 */
export async function setUpProductsTable() {
  await queryWritableDB("DROP TABLE IF EXISTS products");
  await queryWritableDB(
    "CREATE TABLE IF NOT EXISTS products (id INT PRIMARY KEY, category VARCHAR, name VARCHAR)",
  );
  await queryWritableDB(
    "INSERT INTO products (id, name, category) VALUES (1, 'A', 'Gizmo'), (2, 'B', 'Widget')",
  );
}

/** Port of `H.queryWritableDB("ALTER TABLE products DROP COLUMN category")`. */
export async function dropCategoryColumn() {
  await queryWritableDB("ALTER TABLE products DROP COLUMN category");
}

/**
 * Upstream is `H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: "products" })`.
 *
 * `tableName` gates on "a table called products has initial_sync_status
 * complete" — which the `postgres-writable` snapshot's OWN stale `products`
 * row satisfies on the FIRST poll, before the resync of the table we just
 * dropped and recreated has done anything. (Same family as the
 * `resyncDatabase({ dbId })` hole in PORTING.md, but caused by a stale
 * *complete* row rather than a missing argument; Cypress's command-queue
 * pacing hides it upstream.)
 *
 * So: run the faithful resync, then additionally poll until the field set the
 * rest of the test depends on is actually present. Without this the sandbox
 * column picker can be offered the pre-drop column list.
 */
export async function resyncProductsTable(api: MetabaseApi) {
  await resyncDatabase(api, {
    dbId: WRITABLE_DB_ID,
    tables: ["products"],
  });
  return waitForSyncedField(api, "category");
}

/** Poll until `products` has a field named `name`, and return its table id. */
export async function waitForSyncedField(
  api: MetabaseApi,
  name: string,
): Promise<number> {
  let resolved: number | null = null;
  await expect(async () => {
    // Schema pinned: the shared container carries debris schemas and an
    // unpinned lookup can win a foreign same-named table.
    const tableId = await getTableId(api, {
      databaseId: WRITABLE_DB_ID,
      name: "products",
      schema: "public",
    });
    const body = (await (
      await api.get(`/api/table/${tableId}/query_metadata`)
    ).json()) as { fields?: { id: number; name: string }[] };
    const fields = body.fields ?? [];
    if (!fields.some((field) => field.name === name)) {
      throw new Error(
        `Field ${name} not synced yet on products (have: ${fields
          .map((field) => field.name)
          .join(", ")})`,
      );
    }
    resolved = tableId;
  }).toPass({ timeout: 120_000 });
  if (resolved == null) {
    throw new Error(`Field ${name} never synced on products`);
  }
  return resolved;
}

/** Port of H.getTableId({ name: "products" }) for this spec. */
export function getProductsTableId(api: MetabaseApi) {
  return getTableId(api, {
    databaseId: WRITABLE_DB_ID,
    name: "products",
    schema: "public",
  });
}

export { createQuestion };

/**
 * Port of `configureSandboxPolicy` (e2e-sandboxing-helpers.ts:337-418),
 * restricted to the `filterTableBy: "column"` branch — the only branch this
 * spec ever takes. The `custom_view` branch is not reproduced here; the full
 * two-branch port lives in support/sandboxing-via-ui.ts.
 *
 * 🔴 Why this is not just `configureSandboxPolicy` from sandboxing-via-ui:
 * that helper goes straight from `/admin/permissions/data/database/<id>` to
 * `menuitem[name=<tableName>]`, which is correct for a database with ONE
 * schema. Upstream only ever points it at the sample database (one schema) or
 * at a freshly-reset `writable_db` (also one schema, `public`).
 *
 * On this harness `writable_db` is SHARED between slots and is never reset
 * (`resetWritableDb` is unported), so it accumulates debris schemas from
 * other specs. Measured on slot 2: `/admin/permissions/data/database/2`
 * listed 29 schema menuitems (`Domestic`, `public`, `Schema A`…`Schema Z`,
 * `Wild`) and NO table menuitems, so the table click timed out. Descending
 * into the schema first yields `Products` (verified: the same sidebar then
 * lists `Products`, `IP Addresses`, `Many Data Types`, … — themselves debris
 * from neighbouring ports).
 *
 * The schema click is CONDITIONAL, so this is not a behavioural fork: in a
 * clean single-schema environment there is no schema menuitem and the flow is
 * byte-for-byte upstream's.
 */
export async function configureSandboxPolicyOnColumn(
  page: Page,
  { filterColumn }: { filterColumn: string },
  { databaseId = WRITABLE_DB_ID, tableName = "Products", schema = "public" } = {},
) {
  await page.goto(`/admin/permissions/data/database/${databaseId}`);

  // findByRole(role, { name: <string> }) is an EXACT match in testing-library.
  const tableItem = page.getByRole("menuitem", { name: tableName, exact: true });
  const schemaItem = page.getByRole("menuitem", { name: schema, exact: true });
  // Wait for the branch to be DECIDABLE, not merely for the sidebar to have
  // painted something.
  //
  // The old anchor here was `getByRole("menuitem").first()`, which is
  // satisfied by whatever the sidebar renders first. `count()` is a SINGLE,
  // non-retrying sample, so it could be taken before the table list arrived,
  // read 0, and send the flow down the schema branch — where it then waited
  // the full 30s for a `public` menuitem, which is the CI failure
  // (`locator.click: Timeout 30000ms exceeded | waiting for
  // getByRole('menuitem', {name:'public', exact:true})`).
  //
  // And on this harness that branch is now unreachable by design: since
  // 651bc2d5d25 each worker gets its OWN, freshly created writable database
  // (support/writable-db.ts), so `public` is its only schema and the
  // permissions sidebar goes straight to TABLES. `public` therefore never
  // appears at all — which is why taking that branch cannot recover, and why
  // an early `count()` is the only way to reach it. (The schema branch is
  // kept, not deleted: it is still correct for a multi-schema database, e.g.
  // the shared `writable_db` this helper was originally measured against.)
  //
  // Racing the two locators makes the sample happen only once the sidebar has
  // committed to one shape or the other. It changes no assertion.
  await expect(tableItem.or(schemaItem).first()).toBeVisible();
  if ((await tableItem.count()) === 0) {
    await schemaItem.click();
  }
  await tableItem.click();

  await modifyPermission(page, "data", 0, "Row and column security");

  const changeModal = modal(page);
  // Upstream's bare findByText is an implicit existence assertion.
  await expect(
    changeModal.getByText(
      /Change access to this database to .*Row and column security.*?/,
    ),
  ).toHaveCount(1);
  await changeModal.getByRole("button", { name: "Change", exact: true }).click();

  await expect(
    modal(page).getByText(/Configure row and column security for this table/),
  ).toHaveCount(1);

  await expect(
    page.getByRole("radio", { name: /Filter by a column in the table/ }),
  ).toBeChecked();

  await modal(page)
    .getByRole("button", { name: /Pick a column|parameter/ })
    .click();
  await page.getByRole("option", { name: filterColumn, exact: true }).click();
  await modal(page)
    .getByPlaceholder(/Pick a user attribute/)
    .click();
  await page
    .getByRole("option", { name: "filter-attribute", exact: true })
    .click();

  // "Wait for the whole summary to render"
  const summary = page.getByLabel(/Summary/);
  await expect(summary).toContainText("data");

  const summaryText = await summary.innerText();
  expect(summaryText).toContain("Users in data can view");
  expect(summaryText).toContain(`${filterColumn} field equals`);

  await modal(page).getByRole("button", { name: "Save", exact: true }).click();

  await saveChangesToPermissions(page);
}

/**
 * Port of `assertResponseFailsClosed` (e2e-sandboxing-helpers.ts:646-649).
 *
 * Verbatim, including the shape upstream relies on: a *failed* card query
 * still answers with a `data.rows` array (empty) plus an `error_type`, so
 * both halves are real assertions rather than one of them being vacuous.
 *
 * The `rows` check on its own WOULD be weak — an empty array is also what a
 * response with no `data` at all would have to be coaxed into — so
 * `error_type` is the discriminating half, and it is asserted against a
 * closed two-element set rather than mere truthiness.
 */
export function assertResponseFailsClosed(response: {
  body: FailableDatasetBody;
}) {
  expect(response.body?.data?.rows, "no rows are returned").toHaveLength(0);
  expect(
    response.body?.error_type,
    "the query failed with a driver/invalid-query error",
  ).toMatch(/^(driver|invalid-query)$/);
}

export type FailableDatasetBody = {
  data?: { rows?: unknown[][]; is_sandboxed?: boolean };
  error_type?: string;
  json_query?: { query?: unknown };
};
