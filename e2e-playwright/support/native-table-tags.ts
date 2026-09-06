/**
 * Helpers for the native table-template-tags spec
 * (e2e/test/scenarios/native/table-tags.cy.spec.ts).
 *
 * A `{{table}}` template tag in a native SQL query can be assigned the
 * "Table" variable type via the variable-type-select widget, then mapped to a
 * concrete table (referenced as a CTE when the query runs). These helpers wrap
 * that mapping flow; everything else (startNewNativeQuestion, typeInNativeEditor,
 * runNativeQuery, assertQueryBuilderRowCount) comes from the shared modules.
 */
import type { Locator, Page } from "@playwright/test";

import { popover } from "./ui";

/** Port of `cy.findByTestId("variable-type-select")`. */
export function variableTypeSelect(page: Page): Locator {
  return page.getByTestId("variable-type-select");
}

/**
 * Assign the currently-shown template tag the "Table" variable type and map it
 * to the named table:
 *   cy.findByTestId("variable-type-select").click();
 *   H.popover().findByText("Table").click();
 *   H.popover().findByText(tableName).click();
 * findByText string args are exact matches (PORTING rule 1).
 */
export async function mapTableTag(page: Page, tableName: string) {
  await variableTypeSelect(page).click();
  await popover(page).getByText("Table", { exact: true }).click();
  await popover(page).getByText(tableName, { exact: true }).click();
}
