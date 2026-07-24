/**
 * Ports of the native-filter helpers used by the SQL filter specs:
 * - e2e/test/scenarios/native-filters/helpers/e2e-sql-filter-helpers.js
 *   (SQLFilter.*)
 * - e2e/test/scenarios/native-filters/helpers/e2e-field-filter-helpers.js
 *   (FieldFilter.*)
 * - the filter-widget `H` helpers from e2e-ui-elements-helpers.js
 *   (clearFilterWidget, removeFieldValuesValue, fieldValuesCombobox,
 *   multiAutocompleteInput)
 */
import type { Locator, Page } from "@playwright/test";

import { filterWidget, selectDropdown } from "./dashboard";
import { icon } from "./dashboard-cards";
import { expect } from "./fixtures";
import { waitForDataset } from "./models";
import { popover } from "./ui";

// === SQLFilter.* (e2e-sql-filter-helpers.js) ===

/**
 * Port of SQLFilter.openTypePickerFromSelectedFilterType /
 * openTypePickerFromDefaultFilterType — both just click the type select.
 */
export async function openTypePickerFromDefaultFilterType(page: Page) {
  await page.getByTestId("variable-type-select").click();
}

/** Port of SQLFilter.chooseType. */
export async function chooseType(page: Page, filterType: string) {
  await selectDropdown(page).getByText(filterType, { exact: true }).click();
}

/** Port of SQLFilter.toggleRequired (clicks the toggle's label text). */
export async function toggleRequired(page: Page) {
  await page.getByText("Always require a value", { exact: true }).click();
}

/** Port of SQLFilter.getRunQueryButton. */
export function getRunQueryButton(page: Page): Locator {
  return page
    .getByTestId("native-query-editor-container")
    .getByTestId("run-button");
}

/** Port of SQLFilter.getSaveQueryButton. */
export function getSaveQueryButton(page: Page): Locator {
  return page.getByRole("button", { name: "Save", exact: true });
}

/**
 * Port of SQLFilter.runQuery: click run, wait for POST /api/dataset (the
 * Cypress "@dataset" alias), then make sure the visualization root exists.
 */
export async function runQuery(page: Page) {
  const datasetResponse = waitForDataset(page);
  await getRunQueryButton(page).click();
  await datasetResponse;
  await expect(page.getByTestId("query-visualization-root")).toBeAttached();
}

/** Port of SQLFilter.setFieldAlias (clear + type + blur). */
export async function setFieldAlias(page: Page, alias: string) {
  const input = page.getByTestId("field-alias-input");
  await input.clear();
  await input.pressSequentially(alias);
  await input.blur();
}

// === FieldFilter.* (e2e-field-filter-helpers.js) ===

/**
 * Port of FieldFilter.mapTo: pick the table, then the field, from the
 * mapping popover. cy.contains = case-sensitive substring, first match.
 */
export async function mapFieldFilterTo(
  page: Page,
  { table, field }: { table: string; field: string },
) {
  await popover(page)
    .getByText(new RegExp(escapeRegExp(table)))
    .first()
    .click();
  await popover(page)
    .getByText(new RegExp(escapeRegExp(field)))
    .first()
    .click();
}

// === filter-widget helpers (e2e-ui-elements-helpers.js) ===

/** Port of H.clearFilterWidget: click the widget's close icon (hover-gated). */
export async function clearFilterWidget(page: Page, index = 0) {
  const widget = filterWidget(page).nth(index);
  await widget.hover();
  await icon(widget, "close").click();
}

/**
 * Port of H.removeFieldValuesValue: the nth "Remove" button among the
 * token-field values. Takes a scope (the Cypress helper ran inside
 * popover().within()).
 */
export async function removeFieldValuesValue(scope: Locator, index: number) {
  await scope
    .getByTestId("token-field")
    .getByLabel("Remove", { exact: true })
    .nth(index)
    .click();
}

/** Port of H.fieldValuesCombobox (cy.findByRole("combobox") in scope). */
export function fieldValuesCombobox(scope: Locator): Locator {
  return scope.getByRole("combobox");
}

/**
 * Port of H.multiAutocompleteInput. The Cypress helper's trailing
 * `.get("input").first()` re-queries the whole within() scope, so inside
 * popover().within() it resolves to the popover's first <input> — mirror
 * that effective behavior.
 */
export function multiAutocompleteInput(scope: Locator): Locator {
  return scope.locator("input").first();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
