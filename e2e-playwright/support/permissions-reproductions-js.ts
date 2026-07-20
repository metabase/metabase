/**
 * Spec-local helpers for the Playwright port of
 * e2e/test/scenarios/permissions/permissions-reproductions.cy.spec.**js**
 *
 * 🔴 NAME DEVIATION, ON PURPOSE. The obvious module name
 * `support/permissions-reproductions.ts` is NOT used, and neither is the
 * obvious spec name `tests/permissions-reproductions.spec.ts`. The upstream
 * `permissions/` directory holds a **disjoint sibling pair**:
 *
 *   permissions-reproductions.cy.spec.ts  (4.5 KB — issues 11994/39221/76710)
 *       → already ported, committed as tests/permissions-reproductions.spec.ts
 *   permissions-reproductions.cy.spec.js  (19 KB — issues 13347/14873/17777/
 *       19603/20436/22447/22473/22695/22726/22727/23981/24966)
 *       → THIS port, tests/permissions-reproductions-js.spec.ts
 *
 * The two share no issue numbers. Taking the obvious name would have silently
 * overwritten the landed `.ts` port (PORTING.md's same-basename hazard, which
 * previously bit visualizations-charts-reproductions). The `-js` suffix follows
 * the existing `support/native-reproductions-js.ts` precedent.
 *
 * Lives in its own module so shared support files stay untouched (rule 9).
 */
import { expect } from "@playwright/test";
import type { Page, Response } from "@playwright/test";

import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";

import type { MetabaseApi } from "./api";
import { popover } from "./ui";

/**
 * Port of NODATA_USER_ID (cypress_sample_instance_data.js). DERIVED, not
 * hardcoded — the sibling ids this spec needs (ORDERS_QUESTION_ID = 94,
 * ORDERS_DASHBOARD_ID = 10) are nothing like the `1`s a guess would produce,
 * which is the fixture-id trap in miniature.
 */
export const NODATA_USER_ID: number = (() => {
  const user = SAMPLE_INSTANCE_DATA.users.find(
    (candidate) => candidate.email === "nodata@metabase.test",
  );
  if (!user) {
    throw new Error('User "nodata@metabase.test" not found in instance data');
  }
  return Number(user.id);
})();

/**
 * The spec's own `const PG_DB_ID = 2`. Under the `postgres-12` snapshot
 * database 2 is the read-only "QA Postgres12" sample — NOT the writable
 * container — so nothing here is exposed to the shared-writable-container
 * contamination described in FINDINGS #85.
 */
export const PG_DB_ID = 2;

export const POSTGRES_SKIP_REASON =
  "Requires the QA Postgres12 container and its postgres-12 snapshot (set PW_QA_DB_ENABLED)";

export const TOKEN_SKIP_REASON =
  "Requires the pro-self-hosted token (advanced_permissions / sandboxes)";

export const MAILDEV_SKIP_REASON =
  "Requires the maildev container (2.x) for SMTP setup";

// === H.withDatabase port =============================================

/**
 * Port of H.withDatabase(dbId, callback): the Cypress helper hands its
 * callback a map carrying BOTH `TABLE_ID` keys and `TABLE.FIELD` keys. The
 * shared `getDatabaseFields` (support/homepage.ts) only builds the field half
 * despite its docstring claiming otherwise, so this returns both.
 */
export async function withDatabase(
  api: MetabaseApi,
  databaseId: number,
): Promise<{
  tableIds: Record<string, number>;
  fields: Record<string, Record<string, number>>;
}> {
  const response = await api.get(
    `/api/database/${databaseId}/metadata?include_hidden=true`,
  );
  const body = (await response.json()) as {
    tables?: {
      name: string;
      id: number;
      fields?: { name: string; id: number }[];
    }[];
  };

  const tableIds: Record<string, number> = {};
  const fields: Record<string, Record<string, number>> = {};
  for (const table of body.tables ?? []) {
    const name = table.name.toUpperCase();
    tableIds[`${name}_ID`] = table.id;
    const tableFields: Record<string, number> = {};
    for (const field of table.fields ?? []) {
      tableFields[field.name.toUpperCase()] = field.id;
    }
    fields[name] = tableFields;
  }
  return { tableIds, fields };
}

// === response predicates (the spec's cy.intercept aliases) ===========

/** POST /api/dataset — the "@dataset" alias. */
export function isDatasetResponse(response: Response): boolean {
  return (
    response.request().method() === "POST" &&
    new URL(response.url()).pathname === "/api/dataset"
  );
}

/** PUT /api/permissions/graph — the "@updatePermissions" alias. */
export function isPermissionsGraphPut(response: Response): boolean {
  return (
    response.request().method() === "PUT" &&
    new URL(response.url()).pathname === "/api/permissions/graph"
  );
}

/** POST /api/card — the "@createCard" alias. */
export function isCreateCardResponse(response: Response): boolean {
  return (
    response.request().method() === "POST" &&
    new URL(response.url()).pathname === "/api/card"
  );
}

// === issue 17777 =====================================================

/** Port of the spec-local hideTables(). */
export async function hideTables(api: MetabaseApi, ids: number[]) {
  await api.put("/api/table", { ids, visibility_type: "hidden" });
}

// === issue 20436 =====================================================

/**
 * Port of the spec-local changePermissions(from, to).
 *
 * Upstream is `cy.findAllByText(from).first().click()` — testing-library's
 * string `findAllByText` is an EXACT match (rule 1), and `.first()` mirrors
 * Cypress's first-match semantics on a deliberately multi-match subject.
 */
export async function changePermissions(page: Page, from: string, to: string) {
  await page.getByText(from, { exact: true }).first().click();
  // `H.popover().contains(to)` — cy.contains is a case-sensitive SUBSTRING
  // returning the first hit, so this stays a substring match with .first().
  await popover(page)
    .getByText(new RegExp(to.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .first()
    .click();
}

/**
 * Port of the spec-local saveChanges(): "Save changes" then the "Yes"
 * confirmation in the modal.
 */
export async function saveChanges(page: Page) {
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("button", { name: "Yes", exact: true }).click();
}

// === issue 22695 =====================================================

/**
 * Port of the spec-local assert(): search for "S" from the home page and
 * confirm the (blocked) Sample Database name is not among the result names.
 *
 * Upstream chains `.should("have.length.above", 0).and("not.contain", ...)`.
 * The length check is what stops the absence half being vacuous — it is the
 * anchor proving results actually rendered — so both halves are ported.
 *
 * Note the `not.contain` half is chai-jquery's ANY-OF form on a multi-element
 * subject (PORTING: `contain` vs `contain.text` behave oppositely), i.e. "no
 * matched element contains the string". `toHaveCount(0)` over a substring
 * filter is exactly that, element-for-element.
 */
export async function assertSearchResultsExcludeSampleDatabase(page: Page) {
  const names = page.getByTestId("search-result-item-name");
  await expect(names.first()).toBeVisible();
  expect(await names.count()).toBeGreaterThan(0);
  await expect(names.filter({ hasText: "Sample Database" })).toHaveCount(0);
}
