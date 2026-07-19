/**
 * Helpers for cc-literals.spec.ts — the spec-local addCustomColumns /
 * removeTableFields functions and the testFilterLiteral routine from
 * e2e/test/scenarios/custom-column/cc-literals.cy.spec.ts.
 *
 * Lives in its own file so the shared support modules stay untouched. The
 * custom-column expression editor is CodeMirror, so entry goes through the
 * shared notebook.ts enterCustomColumnDetails (native keystrokes) and readback
 * through custom-column-3.ts expectCustomExpressionValue.
 *
 * `cy.realPress("Escape")` (close the reopened expression editor popover) ports
 * to page.keyboard.press("Escape").
 */
import type { Page } from "@playwright/test";

import { expectCustomExpressionValue } from "./custom-column-3";
import {
  assertQueryBuilderRowCount,
  enterCustomColumnDetails,
  getNotebookStep,
  openNotebook,
  visualize,
} from "./notebook";
import { popover } from "./ui";

export type CustomColumnInfo = { name: string; expression: string };

/**
 * Port of the spec's module-level addCustomColumns: add each custom column
 * (first via the data step's "Custom column" button, the rest via the
 * expression step's add icon), enter its formula + name, then reopen the pill
 * and assert the editor round-trips the exact formula.
 */
export async function addCustomColumns(
  page: Page,
  columns: CustomColumnInfo[],
) {
  for (const [index, { name, expression }] of columns.entries()) {
    if (index === 0) {
      await getNotebookStep(page, "data")
        .getByRole("button", { name: "Custom column", exact: true })
        .click();
    } else {
      await getNotebookStep(page, "expression").locator(".Icon-add").click();
    }
    await enterCustomColumnDetails(page, { formula: expression, name });
    await popover(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();

    // Reopen the pill and assert the editor round-trips the exact formula.
    await getNotebookStep(page, "expression")
      .getByText(name, { exact: true })
      .first()
      .click();
    await expectCustomExpressionValue(page, expression);
    await page.keyboard.press("Escape");
  }
}

/**
 * Port of the "literals in custom columns" test's local removeTableFields:
 * toggle the data step's field picker, "Select all" (deselects them all bar
 * ID), then close the picker.
 */
export async function removeTableFields(page: Page) {
  await getNotebookStep(page, "data")
    .getByRole("button", { name: "Pick columns", exact: true })
    .click();
  await popover(page).getByText("Select all", { exact: true }).click();
  await getNotebookStep(page, "data")
    .getByRole("button", { name: "Pick columns", exact: true })
    .click();
}

/**
 * Port of the "literals in filters" test's local testFilterLiteral: add a
 * custom-expression filter, assert the editor round-trips it, run the query and
 * assert the row count, then remove the filter clause.
 */
export async function testFilterLiteral(
  page: Page,
  {
    filterExpression,
    filterDisplayName,
    expectedRowCount,
  }: {
    filterExpression: string;
    filterDisplayName: string;
    expectedRowCount: number;
  },
) {
  // add filter
  await getNotebookStep(page, "expression")
    .getByRole("button", { name: "Filter", exact: true })
    .click();
  await popover(page).getByText("Custom Expression", { exact: true }).click();
  await enterCustomColumnDetails(page, { formula: filterExpression });
  await popover(page).getByRole("button", { name: "Done", exact: true }).click();

  // assert expression
  await getNotebookStep(page, "filter")
    .getByText(filterDisplayName, { exact: true })
    .first()
    .click();
  await expectCustomExpressionValue(page, filterExpression);
  await page.keyboard.press("Escape");

  // assert query results
  await visualize(page);
  await assertQueryBuilderRowCount(page, expectedRowCount);
  await openNotebook(page);

  // Remove the filter clause. Upstream scopes the close icon to the pill via
  // findByText(name).icon("close"). The pill is a single button labelled
  // "<displayName> close icon" whose CENTRE is the clause text — clicking the
  // button reopens the editor rather than removing it, so click the close icon
  // itself (distinct from the step-level "Remove step" icon).
  await getNotebookStep(page, "filter")
    .getByRole("button", { name: `${filterDisplayName} close icon`, exact: true })
    .getByRole("img", { name: "close icon", exact: true })
    .click();
}
