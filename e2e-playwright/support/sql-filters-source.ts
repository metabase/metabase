/**
 * Helpers for the sql-filters-source spec port. Lives in its own file so the
 * shared support modules stay untouched; everything reusable is imported
 * read-only from those modules.
 *
 * Ports of:
 * - FieldFilter.* value-entry helpers (openEntryForm, closeEntryForm,
 *   selectFilterValueFromList, setWidgetType) from
 *   e2e/test/scenarios/native-filters/helpers/e2e-field-filter-helpers.js —
 *   native-filters.ts covers the type-picker / mapping helpers but not these.
 * - The values-source `H` helpers from e2e-filter-helpers.js that dashboard.ts
 *   did NOT port (setDropdownFilterType, setSearchBoxFilterType,
 *   setConnectedFieldSource, checkFilterListSourceHasValue). The two it DOES
 *   port (setFilterListSource, setFilterQuestionSource) are imported from there.
 * - The field-values widget `H` helpers from e2e-ui-elements-helpers.js
 *   (fieldValuesValue, multiAutocompleteValue) and
 *   H.dashboardParametersPopover (e2e-dashboard-helpers.ts).
 * - The spec-local checkFilterValueInList / checkFilterValueNotInList /
 *   updateQuestion, and a runQuery that waits on the specific endpoint the
 *   Cypress `@` alias named.
 */
import type { Locator, Page } from "@playwright/test";

import { filterWidget, selectDropdown } from "./dashboard";
import { expect } from "./fixtures";
import { icon, modal, popover } from "./ui";

// === FieldFilter.* value-entry helpers (e2e-field-filter-helpers.js) ===

/**
 * Port of FieldFilter.openEntryForm: click the filter widget, or — when the
 * tag is required — the "Enter a default value…" affordance in the sidebar.
 */
export async function openEntryForm(page: Page, isFilterRequired = false) {
  if (isFilterRequired) {
    await page.getByText("Enter a default value…", { exact: true }).click();
  } else {
    await filterWidget(page).click();
  }
}

/** Port of FieldFilter.closeEntryForm: press Escape in the popover input. */
export async function closeEntryForm(page: Page) {
  await popover(page).locator("input").first().press("Escape");
}

/** Port of FieldFilter.setWidgetType. */
export async function setWidgetType(page: Page, type: string) {
  await page
    .getByText("Filter widget type", { exact: true })
    .locator("..")
    .getByTestId("filter-widget-type-select")
    .click();
  await selectDropdown(page).getByText(type, { exact: true }).click();
}

/**
 * Port of FieldFilter.selectFilterValueFromList: pick a value from the
 * field-values list widget. cy.findByText is exact; the optional search box
 * gets real keystrokes + Enter.
 */
export async function selectFilterValueFromList(
  page: Page,
  value: string,
  {
    addFilter = true,
    buttonLabel = "Add filter",
    search = false,
  }: { addFilter?: boolean; buttonLabel?: string; search?: boolean } = {},
) {
  const pop = popover(page).first();
  if (search) {
    await pop.getByPlaceholder("Search the list").pressSequentially(value);
    await pop.getByPlaceholder("Search the list").press("Enter");
  }
  await pop.getByText(value, { exact: true }).click();
  if (addFilter) {
    await pop.getByRole("button", { name: buttonLabel, exact: true }).click();
  }
}

// === values-source helpers (e2e-filter-helpers.js) ===

/** Port of H.setDropdownFilterType (clicks the "Dropdown list" radio label). */
export async function setDropdownFilterType(page: Page) {
  await page.getByText("Dropdown list", { exact: true }).click();
}

/** Port of H.setSearchBoxFilterType (clicks the "Search box" radio label). */
export async function setSearchBoxFilterType(page: Page) {
  await page.getByText("Search box", { exact: true }).click();
}

/** Port of H.setConnectedFieldSource: pick table then field from the popover.
 * The Cypress helper used findByText — exact matches. */
export async function setConnectedFieldSource(
  page: Page,
  table: string,
  field: string,
) {
  await popover(page).getByText(table, { exact: true }).click();
  await popover(page).getByText(field, { exact: true }).click();
}

/**
 * Port of H.checkFilterListSourceHasValue: open Edit, switch to Custom list,
 * assert the textbox holds exactly the joined values, then close the modal.
 */
export async function checkFilterListSourceHasValue(
  page: Page,
  { values }: { values: (string | string[])[] },
) {
  await page.getByText("Edit", { exact: true }).click();
  const expected = values
    .map((value) => (Array.isArray(value) ? value.join(", ") : value))
    .join("\n");
  const dialog = modal(page);
  await dialog.getByText("Custom list", { exact: true }).click();
  await expect(dialog.getByRole("textbox")).toHaveValue(expected);
  await icon(dialog, "close").click();
}

// === field-values widget helpers (e2e-ui-elements-helpers.js) ===

/** Port of H.fieldValuesValue: the nth token-field value pill. */
export function fieldValuesValue(page: Page, index = 0): Locator {
  return page.getByTestId("token-field").nth(index);
}

/**
 * Port of H.multiAutocompleteValue: the nth [data-with-remove] sibling of the
 * (first) combobox — the selected value pill.
 */
export function multiAutocompleteValue(page: Page, index = 0): Locator {
  return page
    .getByRole("combobox")
    .first()
    .locator("xpath=../*[@data-with-remove]")
    .nth(index);
}

/** Port of H.dashboardParametersPopover (popover with the value-dropdown testid). */
export function dashboardParametersPopover(page: Page): Locator {
  return page.getByTestId("parameter-value-dropdown");
}

// === spec-local helpers ===

/** Port of the spec-local checkFilterValueInList: value present in last popover. */
export async function checkFilterValueInList(page: Page, value: string) {
  await expect(
    popover(page).last().getByText(value, { exact: true }),
  ).toBeVisible();
}

/** Port of the spec-local checkFilterValueNotInList: value absent in last popover. */
export async function checkFilterValueNotInList(page: Page, value: string) {
  await expect(
    popover(page).last().getByText(value, { exact: true }),
  ).toHaveCount(0);
}

/**
 * Port of the spec-local updateQuestion: click Save, confirm in the save modal,
 * and wait for the PUT /api/card/:id (the Cypress "@updateQuestion" alias).
 */
export async function updateQuestion(page: Page) {
  const updated = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      /^\/api\/card\/\d+$/.test(new URL(response.url()).pathname),
  );
  await page
    .getByTestId("qb-header")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await page
    .getByTestId("save-question-modal")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await updated;
}

/**
 * Port of SQLFilter.runQuery(xhrAlias): run the query, wait for the specific
 * endpoint the Cypress alias named, then assert the visualization rendered.
 * "cardQuery" → POST /api/card/:id/query (a clean saved question);
 * "dataset"   → POST /api/dataset (an ad-hoc / dirty question).
 */
export async function runQuery(
  page: Page,
  xhrAlias: "cardQuery" | "dataset" = "dataset",
) {
  const isMatch = (method: string, pathname: string) =>
    method === "POST" &&
    (xhrAlias === "cardQuery"
      ? /^\/api\/card\/\d+\/query$/.test(pathname)
      : pathname === "/api/dataset");
  const queryResponse = page.waitForResponse((response) =>
    isMatch(response.request().method(), new URL(response.url()).pathname),
  );
  await page
    .getByTestId("native-query-editor-container")
    .getByTestId("run-button")
    .click();
  await queryResponse;
  await expect(page.getByTestId("query-visualization-root")).toBeAttached();
}
