/**
 * Playwright port of
 * e2e/test/scenarios/custom-column/cc-literals.cy.spec.ts
 *
 * Literal values in custom-column expressions: boolean (True/False), numeric
 * (0, 10), and string literals (plain strings and date/datetime/time strings),
 * plus column references and simple arithmetic, asserted in the QB result
 * table; boolean literals used in custom-expression filters (with row-count
 * assertions); and a literal-valued custom column reused across filter /
 * aggregation / breakout / sort clauses.
 *
 * The expression editor is CodeMirror — entry goes through the shared
 * enterCustomColumnDetails (native keystrokes) and readback through
 * expectCustomExpressionValue. `cy.realPress("Escape")` → keyboard Escape.
 * The `cy.wait("@dataset")` implicit in H.visualize is folded into visualize().
 *
 * Spec-local addCustomColumns / removeTableFields / testFilterLiteral live in
 * support/cc-literals.ts.
 */
import {
  addCustomColumns,
  removeTableFields,
  testFilterLiteral,
} from "../support/cc-literals";
import { test } from "../support/fixtures";
import { openTableNotebook } from "../support/joins";
import { assertTableData } from "../support/multiple-column-breakouts";
import {
  enterCustomColumnDetails,
  getNotebookStep,
  visualize,
} from "../support/notebook";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { popover } from "../support/ui";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

test.describe("scenarios > custom column > literals", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should support literals in custom columns", async ({ page }) => {
    const columns = [
      { name: "True", expression: "True", value: "true" },
      { name: "False", expression: "False", value: "false" },
      { name: "Zero", expression: "0", value: "0" },
      { name: "Number", expression: "10", value: "10" },
      { name: "String", expression: '"abc"', value: "abc" },
      { name: "DateString", expression: '"2024-01-01"', value: "2024-01-01" },
      {
        name: "DateTimeString",
        expression: '"2024-01-01T10:20:00"',
        value: "2024-01-01T10:20:00",
      },
      { name: "TimeString", expression: '"10:20"', value: "10:20" },
      { name: "Column", expression: "[Number]", value: "10" },
      { name: "Expression", expression: "[Number] + [Number]", value: "20" },
    ];

    await openTableNotebook(page, PRODUCTS_ID);
    await removeTableFields(page);
    await addCustomColumns(page, columns);
    await visualize(page);
    await assertTableData(page, {
      columns: ["ID", ...columns.map(({ name }) => name)],
      firstRows: [["1", ...columns.map(({ value }) => value)]],
    });
  });

  test("should support literals in filters", async ({ page }) => {
    const columns = [
      { name: "TrueColumn", expression: "True" },
      { name: "FalseColumn", expression: "False" },
    ];

    await openTableNotebook(page, PRODUCTS_ID);
    await addCustomColumns(page, columns);
    await testFilterLiteral(page, {
      filterExpression: "False",
      filterDisplayName: "false",
      expectedRowCount: 0,
    });
    await testFilterLiteral(page, {
      filterExpression: "True",
      filterDisplayName: "true",
      expectedRowCount: 200,
    });
    await testFilterLiteral(page, {
      filterExpression: "[TrueColumn]",
      filterDisplayName: "TrueColumn",
      expectedRowCount: 200,
    });
    await testFilterLiteral(page, {
      filterExpression: "[FalseColumn]",
      filterDisplayName: "FalseColumn",
      expectedRowCount: 0,
    });
    await testFilterLiteral(page, {
      filterExpression: "[TrueColumn] OR [FalseColumn]",
      filterDisplayName: "TrueColumn or FalseColumn",
      expectedRowCount: 200,
    });
    await testFilterLiteral(page, {
      filterExpression: "[TrueColumn] = [FalseColumn]",
      filterDisplayName: "TrueColumn is FalseColumn",
      expectedRowCount: 0,
    });
  });

  test("should support custom columns with literal values used in other clauses", async ({
    page,
  }) => {
    await openTableNotebook(page, PRODUCTS_ID);
    await getNotebookStep(page, "data")
      .getByRole("button", { name: "Custom column", exact: true })
      .click();
    await enterCustomColumnDetails(page, { name: "Column", formula: "10" });
    await popover(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();
    await getNotebookStep(page, "expression")
      .getByRole("button", { name: "Filter", exact: true })
      .click();
    await popover(page).getByText("Column", { exact: true }).click();
    await popover(page).getByPlaceholder("Min").fill("5");
    await popover(page).getByRole("button", { name: "Add filter", exact: true }).click();
    await getNotebookStep(page, "filter")
      .getByRole("button", { name: "Summarize", exact: true })
      .click();
    await popover(page).getByText("Average of ...", { exact: true }).click();
    await popover(page).getByText("Column", { exact: true }).click();
    await getNotebookStep(page, "summarize")
      .getByText("Pick a column to group by", { exact: true })
      .click();
    await popover(page).getByText("Column", { exact: true }).click();
    await getNotebookStep(page, "summarize")
      .getByRole("button", { name: "Sort", exact: true })
      .click();
    await popover(page).getByText("Column", { exact: true }).click();
    await visualize(page);
    await assertTableData(page, {
      columns: ["Column", "Average of Column"],
      firstRows: [["10", "10"]],
    });
  });
});
