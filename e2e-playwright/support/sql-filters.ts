/**
 * New helpers for the sql-filters port
 * (e2e/test/scenarios/native-filters/sql-filters.cy.spec.js).
 *
 * The SQLFilter.* surface (openTypePickerFromDefaultFilterType, chooseType,
 * toggleRequired, getRunQueryButton, getSaveQueryButton, runQuery) already
 * lives in support/native-filters.ts — import those from there. Only the two
 * value-entry helpers this spec needs and that aren't ported anywhere are here.
 */
import type { Page } from "@playwright/test";

import { filterWidget } from "./dashboard";

/**
 * Port of SQLFilter.setWidgetValue: `filterWidget().type(value)` — type the
 * value into the (single) top parameter widget's input.
 */
export async function setWidgetValue(page: Page, value: string) {
  await filterWidget(page).locator("input").first().fill(value);
}

/**
 * Port of SQLFilter.setDefaultValue: type into the sidebar's
 * "Enter a default value…" placeholder input.
 */
export async function setDefaultValue(page: Page, value: string) {
  await page.getByPlaceholder("Enter a default value…").fill(value);
}
