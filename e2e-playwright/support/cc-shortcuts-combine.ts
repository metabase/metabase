/**
 * Helpers for the combine-columns shortcut spec port
 * (e2e/test/scenarios/custom-column/cc-shortcuts-combine.cy.spec.ts): the
 * "Combine columns" shortcut in the notebook custom-column / expression flow.
 * These are the spec-local `selectCombineColumns` / `selectColumn` / `addColumn`.
 *
 * NB this is a different flow from support/column-shortcuts.ts's `combineColumns`
 * (which drives the table-header "+" Add-column modal). This one drives the
 * expression-editor widget opened via H.addCustomColumn.
 *
 * Kept in its own module per PORTING.md rule 9 (never edit shared support files —
 * import from them read-only).
 */
import type { Page } from "@playwright/test";

import { expressionEditorWidget } from "./notebook";
import { popover } from "./ui";

/** Port of the spec-local selectCombineColumns. findByText string is exact. */
export async function selectCombineColumns(page: Page) {
  await popover(page).getByText("Combine columns", { exact: true }).click();
}

/**
 * Port of the spec-local selectColumn(index, table, name?): click the index-th
 * column-input inside the expression widget, then pick from the fresh dropdown
 * popover (H.popover().last()). findByText strings are exact (rule 1).
 */
export async function selectColumn(
  page: Page,
  index: number,
  table: string,
  name?: string,
) {
  // eslint-disable-next-line metabase/no-unsafe-element-filtering — .eq(index)
  await expressionEditorWidget(page).getByTestId("column-input").nth(index).click();

  // eslint-disable-next-line metabase/no-unsafe-element-filtering — H.popover().last()
  const pop = popover(page).last();
  if (name) {
    // both table and name given (an FK-joined column)
    await pop.getByText(table, { exact: true }).click();
    await pop.getByText(name, { exact: true }).click();
  } else {
    await pop.getByText(table, { exact: true }).click();
  }
}

/** Port of the spec-local addColumn. findByText string is exact. */
export async function addColumn(page: Page) {
  await expressionEditorWidget(page).getByText("Add column", { exact: true }).click();
}
