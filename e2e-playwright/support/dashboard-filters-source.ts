/**
 * Helpers for tests/dashboard-filters-source.spec.ts (port of
 * e2e/test/scenarios/dashboard-filters/dashboard-filters-source.cy.spec.js).
 *
 * Two things live here rather than in a shared module:
 *
 * 1. `setFilterQuestionSource` — a SUPERSET of the one in support/dashboard.ts.
 *    The shared version drops the `labelField` branch of upstream's
 *    H.setFilterQuestionSource (e2e/support/helpers/e2e-filter-helpers.js:17),
 *    which the three "question source with custom labels" tests need. Shared
 *    modules are off-limits to porting agents, so the full port lives here.
 *    CONSOLIDATION CANDIDATE: fold `labelField` into support/dashboard.ts's
 *    version and delete this one.
 *
 * 2. `resetIpAddressesTable` — upstream calls
 *    H.resetTestTable({ type: "postgres", table: "ip_addresses" }), which routes
 *    through cy.task("resetTable") → e2e/support/test_tables.js `ip_addresses`.
 *    The existing port of `resetTestTable` (support/actions-on-dashboards.ts)
 *    only knows `scoreboard_actions` / `many_data_types`, and its knex client
 *    is not exported — so this rebuilds the same table through the exported
 *    `queryWritableDB` instead. Schema and rows are copied from
 *    e2e/support/test_tables.js:243 and e2e/support/test_tables_data.js:56.
 */
import type { Locator, Page } from "@playwright/test";

import { queryWritableDB } from "./actions-on-dashboards";
import { pickEntity, selectDropdown } from "./dashboard";
import { findByDisplayValue } from "./filters-repros";
import { expect } from "./fixtures";
import { modal } from "./ui";

/**
 * Full port of H.setFilterQuestionSource({ question, field, labelField }).
 *
 * Upstream's `findByRole("option", { name: field, hidden: true })` uses a
 * testing-library string `name`, which is an exact match — hence
 * `exact: true, includeHidden: true`.
 */
export async function setFilterQuestionSource(
  page: Page,
  {
    question,
    field,
    labelField,
  }: { question: string; field: string; labelField?: string },
) {
  await page.getByText("Edit", { exact: true }).click();

  const dialog = modal(page);
  await dialog.getByText("From another model or question").click();
  await dialog.getByText("Pick a model or question…").click();

  await pickEntity(page, { path: [/Our analytics/, question], select: true });

  await dialog.getByPlaceholder("Pick a column…").click();
  await selectDropdown(page)
    .getByRole("option", { name: field, exact: true, includeHidden: true })
    .click();

  if (labelField) {
    // upstream cy.log: "the label selector defaults to None until a column is
    // chosen" — the visible assertion is that the label picker exists and
    // still reads "None".
    await expect(
      dialog.getByText("Column to supply the labels", { exact: true }),
    ).toBeVisible();
    // cy.findByDisplayValue("None") — a Mantine Select's <input>, so the
    // input/textarea/select scan in filters-repros.ts is the faithful query.
    (await findByDisplayValue(dialog, "None")).click();

    await selectDropdown(page)
      .getByRole("option", { name: labelField, exact: true, includeHidden: true })
      .click();
  }

  await dialog.getByRole("button", { name: "Done" }).click();
}

/**
 * Port of the `ip_addresses` factory in e2e/support/test_tables.js.
 *
 * NOTE the column types: `count` is TEXT (knex `table.text("count")`) even
 * though the rows insert integers, and `inet` is added by raw DDL because knex
 * has no `inet` builder. Both matter — the spec's second test relabels `count`
 * as type/Quantity, and the first exercises custom labels on an inet column.
 */
export async function resetIpAddressesTable() {
  await queryWritableDB("DROP TABLE IF EXISTS ip_addresses", "postgres");
  await queryWritableDB("CREATE TABLE ip_addresses (count text)", "postgres");
  await queryWritableDB("ALTER TABLE ip_addresses ADD inet inet", "postgres");
  await queryWritableDB(
    "INSERT INTO ip_addresses (inet, count) VALUES " +
      "('192.168.0.1/24', '42'), ('127.0.0.1', '365')",
    "postgres",
  );
}

/** Port of H.fieldValuesValue(index) scoped to a popover, as upstream's
 * within() block scopes cy.findAllByTestId. */
export function fieldValuesValueIn(scope: Locator, index = 0): Locator {
  return scope.getByTestId("token-field").nth(index);
}
