/**
 * Helpers for the dashboard-filters-clear-and-restore port
 * (e2e/test/scenarios/dashboard-filters/dashboard-filters-clear-and-restore.cy.spec.ts).
 *
 * The spec's own local helpers (mapFilterToQuestion, editFilter, editFilterType,
 * setFilterSourceFromConnectedFields) plus a port of the shared H helper
 * `checkFilterListSourceHasValue` (e2e-filter-helpers.js) — which is not yet in
 * the shared dashboard.ts surface. Everything the spec reuses (setFilter,
 * setFilterListSource, editDashboard, saveDashboard, sidebar, selectDropdown) is
 * imported from the shared modules.
 */
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { selectDropdown, sidebar } from "./dashboard";
import { icon, modal, popover } from "./ui";

/** Port of the spec-local mapFilterToQuestion. findByText strings are exact. */
export async function mapFilterToQuestion(page: Page, column = "Quantity") {
  await page.getByText("Select…", { exact: true }).click();
  await popover(page).getByText(column, { exact: true }).click();
}

/** Port of the spec-local editFilter: click a filter pill by name in the
 * edit-mode parameters widget. */
export async function editFilter(page: Page, name: string) {
  await page
    .getByTestId("edit-dashboard-parameters-widget-container")
    .getByText(name, { exact: true })
    .click();
}

/** Port of the spec-local editFilterType: change the "Filter or parameter type"
 * then the "Filter operator" via the sidebar's `findByText(...).next()` idiom. */
export async function editFilterType(
  page: Page,
  type: string,
  subType: string,
) {
  await sidebar(page)
    .locator(":text('Filter or parameter type') + *")
    .click();
  await selectDropdown(page).getByText(type, { exact: true }).click();

  await sidebar(page).locator(":text('Filter operator') + *").click();
  await selectDropdown(page).getByText(subType, { exact: true }).click();
}

/** Port of the spec-local setFilterSourceFromConnectedFields. */
export async function setFilterSourceFromConnectedFields(page: Page) {
  await sidebar(page).getByText("Edit", { exact: true }).click();
  const dialog = modal(page);
  await dialog.getByText("From connected fields", { exact: true }).click();
  await dialog.getByRole("button", { name: "Done" }).click();
}

/** Port of H.checkFilterListSourceHasValue (e2e-filter-helpers.js): open the
 * values-source Edit modal, assert the Custom-list textbox value, then close it
 * with the modal's X. `cy.icon("close")` is first-match → .first(). */
export async function checkFilterListSourceHasValue(
  page: Page,
  { values }: { values: (string | string[])[] },
) {
  await page.getByText("Edit", { exact: true }).click();

  const expectedString = values
    .map((value) => (Array.isArray(value) ? value.join(", ") : value))
    .join("\n");

  const dialog = modal(page);
  await dialog.getByText("Custom list", { exact: true }).click();
  await expect(dialog.getByRole("textbox")).toHaveValue(expectedString);
  await icon(dialog, "close").first().click();
}
