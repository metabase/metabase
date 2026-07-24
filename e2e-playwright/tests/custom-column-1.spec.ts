/**
 * Playwright port of
 * e2e/test/scenarios/custom-column/custom-column-1.cy.spec.js
 *
 * Custom-column (expression) coverage: creating custom columns in the notebook,
 * grouping/binning behaviour of custom columns, custom expressions after
 * aggregation and across joins, and the CodeMirror expression editor's format /
 * suggestion / validation behaviour.
 *
 * Notes on the port:
 * - The expression editor is CodeMirror. Formulas are typed with native
 *   keystrokes (the shared enterCustomColumnDetails / customExpressionEditorType
 *   / typeExpression), and read back with expectCustomExpressionValue. The
 *   `→` separator is inserted literally by page.keyboard.type — no `->`
 *   replacement (unlike the upstream codeMirror helper).
 * - `H.enterCustomColumnDetails({ format: true })` → shared enterCustomColumnDetails
 *   followed by formatExpression (upstream orders type → blur → format → name;
 *   formatting is order-independent from naming for the values asserted here).
 * - `H.CustomExpressionEditor.type(...)` with `{tab}` snippets → typeExpression
 *   (cc-typing-suggestion), which handles Tab; with only arrow escapes →
 *   customExpressionEditorType (custom-column-3).
 * - `cy.realPress("Tab" / ["Shift", metaKey, "f"])` → page.keyboard.press.
 * - `H.visualize(cb => expect(cb.body.error)...)` → visualize returns the
 *   /api/dataset response; the body's `error` is asserted after awaiting.
 *   `H.visitQuestionAdhoc(..., { callback })` drops the callback (the visible
 *   content assertions that follow already fail if the query errored).
 * - Notebook clause-pill removal (`.findByText(name).icon("close").click()`)
 *   → removeNotebookClauseByText (button `<name> close icon` → inner img).
 * - The @skip-tagged flaky test (#19454) is ported as test.skip, faithfully.
 * - beforeEach `cy.intercept("POST","/api/dataset").as("dataset")` → an explicit
 *   waitForResponse registered before the triggering action in the one test
 *   (`date range filter`) that awaits it; other tests use visualize /
 *   visitQuestionAdhoc, which wait internally.
 */
import type { Page } from "@playwright/test";

import {
  openOrdersTable,
  openPeopleTable,
  openProductsTable,
} from "../support/ad-hoc-question";
import {
  addCustomColumnByLabel,
  formatButton,
  pressFormatShortcut,
  removeNotebookClauseByText,
  typeSnippet,
} from "../support/custom-column-1";
import {
  clearCustomExpressionEditor,
  customExpressionEditorType,
  customExpressionName,
  expectCustomExpressionValue,
  focusCustomExpressionEditor,
  formatExpression,
} from "../support/custom-column-3";
import { createQuestion } from "../support/factories";
import { findByDisplayValue } from "../support/filters-repros";
import { clauseStepPopover } from "../support/filters";
import { test, expect } from "../support/fixtures";
import {
  addCustomColumn,
  filterNotebook,
  miniPickerBrowseAll,
  selectFilterOperator,
  summarizeNotebook,
} from "../support/joins";
import { cartesianChartCircles } from "../support/metrics";
import { summarize as summarizeView } from "../support/multiple-column-breakouts";
import {
  assertQueryBuilderRowCount,
  enterCustomColumnDetails,
  entityPickerModal,
  entityPickerModalLevel,
  expressionEditorWidget,
  getNotebookStep,
  openNotebook,
  queryBuilderMain,
  startNewQuestion,
  tableHeaderClick,
  tableHeaderColumn,
  visualize,
} from "../support/notebook";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { caseSensitiveSubstring } from "../support/text";
import { popover, visitQuestion } from "../support/ui";
import { visitQuestionAdhoc } from "../support/permissions";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

/** cy.button(name) — an exact-name button anywhere on the page. */
function button(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true });
}

// Thin wrappers over the shared ad-hoc-question helpers so each test reads like
// its Cypress original (H.openOrdersTable({ mode: "notebook" }) etc).
const openOrders = (page: Page) => openOrdersTable(page, { mode: "notebook" });
const openPeople = (page: Page) => openPeopleTable(page, { mode: "notebook" });
const openProducts = (page: Page) =>
  openProductsTable(page, { mode: "notebook" });

test.describe("scenarios > question > custom column", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("can see x-ray options when a custom column is present (#16680)", async ({
    page,
    mb,
  }) => {
    const { id } = await createQuestion(mb.api, {
      name: "16680",
      display: "line",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          ["expression", "TestColumn"],
          ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
        ],
        expressions: { TestColumn: ["+", 1, 1] },
      },
    });
    await visitQuestion(page, id);

    await cartesianChartCircles(page).nth(5).click();
    await popover(page)
      .getByText(/Automatic Insights/i)
      .click();
    await expect(popover(page).getByText(/X-ray/i)).toBeVisible();
    await popover(page)
      .getByText(/Compare to the rest/i)
      .click();
  });

  test("can create a custom column (metabase#13241)", async ({ page }) => {
    await openOrders(page);
    await addCustomColumnByLabel(page);

    await enterCustomColumnDetails(page, { formula: "1 + 1", name: "Math" });
    await formatExpression(page);
    await button(page, "Done").click();

    await visualize(page);

    await expect(
      page.getByText("There was a problem with your question", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByTestId("query-visualization-root"),
    ).toContainText("Math");
  });

  test("should not show default period in date column name (metabase#36631)", async ({
    page,
    mb,
  }) => {
    const name = "Base question";
    await createQuestion(mb.api, { name, query: { "source-table": ORDERS_ID } });

    await startNewQuestion(page);
    await miniPickerBrowseAll(page).click();
    await entityPickerModalLevel(page, 0)
      .getByText("Our analytics", { exact: true })
      .click();
    await entityPickerModalLevel(page, 1).getByText(name, { exact: true }).click();

    await button(page, "Custom column").click();
    await enterCustomColumnDetails(page, { formula: "[cre", blur: false });

    const completions = page.getByTestId("custom-expression-editor-suggestions");
    await expect(completions).toBeVisible();
    await expect(completions).toContainText("Created At");
    await expect(completions).not.toContainText("Default period");
  });

  test("should not show binning for a numeric custom column", async ({ page }) => {
    await openOrders(page);
    await addCustomColumnByLabel(page);

    await enterCustomColumnDetails(page, {
      formula: "[Product.Price] / 2",
      name: "Half Price",
    });
    await button(page, "Done").click();

    await button(page, "Summarize").click();
    await popover(page).getByText("Count of rows", { exact: true }).click();

    await getNotebookStep(page, "summarize")
      .getByText("Pick a column to group by", { exact: true })
      .click();

    const option = popover(page).getByRole("option", {
      name: "Half Price",
      exact: true,
    });
    await expect(option.getByLabel("Binning strategy")).toHaveCount(0);
    await expect(option.getByLabel("Temporal bucket")).toHaveCount(0);
    await option.click();

    await expect(
      getNotebookStep(page, "summarize").getByText("Half Price", { exact: true }),
    ).toBeVisible();
  });

  test("should show temporal units for a date/time custom column", async ({
    page,
  }) => {
    await openOrders(page);
    await addCustomColumnByLabel(page);

    await enterCustomColumnDetails(page, {
      formula: "[Product.Created At]",
      name: "Product Date",
    });
    await button(page, "Done").click();

    await button(page, "Summarize").click();
    await popover(page).getByText("Count of rows", { exact: true }).click();

    await getNotebookStep(page, "summarize")
      .getByText("Pick a column to group by", { exact: true })
      .click();

    const option = popover(page).getByRole("option", {
      name: "Product Date",
      exact: true,
    });
    await expect(option.getByLabel("Binning strategy")).toHaveCount(0);
    await expect(option.getByLabel("Temporal bucket")).toHaveCount(1);
    await option.click();

    await expect(
      getNotebookStep(page, "summarize").getByText("Product Date: Month", {
        exact: true,
      }),
    ).toBeVisible();
  });

  test("should not show binning options for a coordinate custom column", async ({
    page,
  }) => {
    await openPeople(page);
    await addCustomColumnByLabel(page);

    await enterCustomColumnDetails(page, {
      formula: "[Latitude]",
      name: "UserLAT",
    });
    await button(page, "Done").click();

    await button(page, "Summarize").click();
    await popover(page).getByText("Count of rows", { exact: true }).click();

    await getNotebookStep(page, "summarize")
      .getByText("Pick a column to group by", { exact: true })
      .click();

    const option = popover(page).getByRole("option", {
      name: "UserLAT",
      exact: true,
    });
    await expect(option.getByLabel("Binning strategy")).toHaveCount(0);
    await expect(option.getByLabel("Temporal bucket")).toHaveCount(0);
    await option.click();

    await expect(
      getNotebookStep(page, "summarize").getByText("UserLAT", { exact: true }),
    ).toBeVisible();
  });

  // flaky test (#19454) — ported faithfully as a skip (upstream tags: "@skip").
  test.skip("should show info popovers when hovering over custom column dimensions in the summarize sidebar", async ({
    page,
  }) => {
    await openOrders(page);
    await addCustomColumnByLabel(page);

    await enterCustomColumnDetails(page, { formula: "1 + 1", name: "Math" });
    await button(page, "Done").click();

    await visualize(page);

    await summarizeView(page);

    await page
      .getByText("Group by", { exact: true })
      .locator("..")
      .getByText("Math", { exact: true })
      .dispatchEvent("mouseenter");

    await expect(popover(page).getByText(caseSensitiveSubstring("Math"))).toBeVisible();
    await expect(
      popover(page).getByText(caseSensitiveSubstring("No description")),
    ).toBeVisible();
  });

  test("can create a custom column with an existing column name", async ({
    page,
  }) => {
    const customFormulas = [
      { formula: "[Quantity] * 2", name: "Double Qt" },
      { formula: "[Quantity] * [Product.Price]", name: "Sum Total" },
    ];

    for (const { formula, name } of customFormulas) {
      await openOrders(page);
      await addCustomColumnByLabel(page);

      await enterCustomColumnDetails(page, { formula, name });
      await button(page, "Done").click();

      await visualize(page);

      await expect(
        page.getByTestId("query-visualization-root"),
      ).toContainText(name);
    }
  });

  test("should create custom column with fields from aggregated data (metabase#12762)", async ({
    page,
  }) => {
    await openOrders(page);

    await summarizeNotebook(page);

    await popover(page).getByText("Sum of ...", { exact: true }).click();
    await popover(page).getByText("Subtotal", { exact: true }).click();

    // TODO (upstream): brittle — no unique parent scopes this "add" icon.
    await page.locator(".Icon-add").last().click();

    await popover(page).getByText("Sum of ...", { exact: true }).click();
    await popover(page).getByText("Total", { exact: true }).click();

    await page.getByText("Pick a column to group by", { exact: true }).click();
    await page.getByText("Created At", { exact: true }).click();

    const columnName = "MegaTotal";
    await page.getByText("Custom column", { exact: true }).click();

    await enterCustomColumnDetails(page, {
      formula: "[Sum of Subtotal] + [Sum of Total]",
      name: columnName,
    });
    await button(page, "Done").click();

    await visualize(page);

    await expect(
      page.getByText("There was a problem with your question", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByTestId("query-visualization-root"),
    ).toContainText(columnName);
  });

  test("should not return same results for columns with the same name (metabase#12649)", async ({
    page,
  }) => {
    await openOrders(page);
    // join with Products
    await page.getByText("Join data", { exact: true }).click();

    await miniPickerBrowseAll(page).click();
    await entityPickerModalLevel(page, 0)
      .getByText("Databases", { exact: true })
      .click();
    await entityPickerModalLevel(page, 1)
      .getByText("Sample Database", { exact: true })
      .click();
    await entityPickerModal(page).getByText("Products", { exact: true }).click();

    // add custom column
    await page.getByText("Custom column", { exact: true }).click();
    await enterCustomColumnDetails(page, { formula: "1 + 1", name: "x" });
    await button(page, "Done").click();

    await visualize(page);

    // ID should be "1" but the bug picks the product ID and shows "14"
    await expect(
      page
        .locator(".test-TableInteractive-cellWrapper--firstColumn")
        .nth(0)
        .getByText("1", { exact: true }),
    ).toBeVisible();
  });

  test("should be able to use custom expression after aggregation (metabase#13857)", async ({
    page,
    mb,
  }) => {
    const CE_NAME = "13857_CE";
    const CC_NAME = "13857_CC";

    await mb.signInAsAdmin();

    const { id } = await createQuestion(mb.api, {
      name: "13857",
      query: {
        expressions: {
          [CC_NAME]: ["*", ["field-literal", CE_NAME, "type/Float"], 1234],
        },
        "source-query": {
          aggregation: [
            [
              "aggregation-options",
              ["*", ["count"], 1],
              { name: CE_NAME, "display-name": CE_NAME },
            ],
          ],
          breakout: [["datetime-field", ["field-id", ORDERS.CREATED_AT], "month"]],
          "source-table": ORDERS_ID,
        },
      },
    });
    await visitQuestion(page, id);

    await expect(page.getByText(CC_NAME, { exact: true })).toBeVisible();
  });

  test("should work with implicit joins (metabase#14080)", async ({
    page,
    mb,
  }) => {
    const CC_NAME = "OneisOne";
    await mb.signInAsAdmin();

    const { id } = await createQuestion(mb.api, {
      name: "14080",
      display: "line",
      query: {
        "source-table": ORDERS_ID,
        expressions: { [CC_NAME]: ["*", 1, 1] },
        aggregation: [
          [
            "distinct",
            ["fk->", ["field-id", ORDERS.PRODUCT_ID], ["field-id", PRODUCTS.ID]],
          ],
          ["sum", ["expression", CC_NAME]],
        ],
        breakout: [["datetime-field", ["field-id", ORDERS.CREATED_AT], "year"]],
      },
    });
    await visitQuestion(page, id);

    await expect(
      page.getByText(caseSensitiveSubstring(`Sum of ${CC_NAME}`)).first(),
    ).toBeVisible();
    await expect
      .poll(() => cartesianChartCircles(page).count())
      .toBeGreaterThanOrEqual(8);
  });

  test("should create custom column after aggregation with 'cum-sum/count' (metabase#13634)", async ({
    page,
    mb,
  }) => {
    const { id } = await createQuestion(mb.api, {
      name: "13634",
      query: {
        expressions: { "Foo Bar": ["+", 57910, 1] },
        "source-query": {
          aggregation: [["cum-count"]],
          breakout: [["datetime-field", ["field-id", ORDERS.CREATED_AT], "month"]],
          "source-table": ORDERS_ID,
        },
      },
    });
    await visitQuestion(page, id);

    await expect(page.getByText("13634", { exact: true })).toBeVisible();
    await expect(page.getByText("Foo Bar", { exact: true })).toBeVisible();
    await expect(page.getByText("57,911", { exact: true }).first()).toBeVisible();
  });

  test("should not be dropped if filter is changed after aggregation (metaabase#14193)", async ({
    page,
    mb,
  }) => {
    const CC_NAME = "Double the fun";

    const { id } = await createQuestion(mb.api, {
      name: "14193",
      query: {
        "source-query": {
          "source-table": ORDERS_ID,
          filter: [">", ["field-id", ORDERS.SUBTOTAL], 0],
          aggregation: [["sum", ["field-id", ORDERS.TOTAL]]],
          breakout: [["datetime-field", ["field-id", ORDERS.CREATED_AT], "year"]],
        },
        expressions: {
          [CC_NAME]: ["*", ["field-literal", "sum", "type/Float"], 2],
        },
      },
    });
    await visitQuestion(page, id);

    // Collapsed filter — click "1" to expand and show the filter name.
    await expect(page.getByTestId("filters-visibility-control")).toHaveText("1");
    await page.getByTestId("filters-visibility-control").click();

    await page
      .getByText(/Subtotal is greater than 0/i)
      .locator("..")
      .locator(".Icon-close")
      .click();

    // Scoped to the results-table header, not page-wide. `useMeasureColumnWidths`
    // renders a second copy of every header cell into an off-screen
    // (visibility:hidden, -9999px) container appended to `document.body`, and
    // tears it down a tick later. While it is up, a page-wide
    // `getByText(CC_NAME, { exact: true })` resolves to TWO elements —
    // Playwright's `toBeVisible()` does not retry through a strict-mode
    // violation, it throws immediately, so the failure reads as deterministic.
    // Cypress's `findByText` retried past the transient duplicate. Scoping to
    // `table-header` (the port of `H.tableInteractiveHeader`) excludes the
    // body-level clone without weakening what is asserted.
    await expect(tableHeaderColumn(page, CC_NAME)).toBeVisible();
  });

  test("should handle identical custom column and table column names (metabase#14255)", async ({
    page,
    mb,
  }) => {
    // Uppercase is important for this reproduction on H2
    const CC_NAME = "CATEGORY";

    const { id } = await createQuestion(mb.api, {
      name: "14255",
      query: {
        "source-table": PRODUCTS_ID,
        expressions: {
          [CC_NAME]: ["concat", ["field-id", PRODUCTS.CATEGORY], "2"],
        },
        aggregation: [["count"]],
        breakout: [["expression", CC_NAME]],
      },
    });
    await visitQuestion(page, id);

    await expect(page.getByText(CC_NAME, { exact: true })).toBeVisible();
    await expect(page.getByText("Gizmo2", { exact: true })).toBeVisible();
  });

  test("should drop custom column (based on a joined field) when a join is removed (metabase#14775)", async ({
    page,
    mb,
  }) => {
    const CE_NAME = "Rounded price";

    const { id } = await createQuestion(mb.api, {
      name: "14775",
      query: {
        "source-table": ORDERS_ID,
        joins: [
          {
            fields: "all",
            "source-table": PRODUCTS_ID,
            condition: [
              "=",
              ["field-id", ORDERS.PRODUCT_ID],
              ["joined-field", "Products", ["field-id", PRODUCTS.ID]],
            ],
            alias: "Products",
          },
        ],
        expressions: {
          [CE_NAME]: [
            "ceil",
            ["joined-field", "Products", ["field-id", PRODUCTS.PRICE]],
          ],
        },
        limit: 5,
      },
    });

    await page.goto(`/question/${id}/notebook`);
    await expect(
      getNotebookStep(page, "expression").getByText(CE_NAME, { exact: true }),
    ).toBeVisible();

    // Remove the join step (its "remove" icon is revealed on hover).
    const joinStep = getNotebookStep(page, "join");
    await joinStep.hover();
    await joinStep.locator(".Icon-close").first().click();
    await expect(getNotebookStep(page, "join")).toHaveCount(0);

    await expect(getNotebookStep(page, "expression")).toHaveCount(0);

    const response = await visualize(page);
    const body = await response.json();
    expect(body.error).toBeFalsy();

    await expect(
      page.getByTestId("cell-data").filter({ hasText: "37.65" }).first(),
    ).toBeVisible();
    await expect(
      page.getByTestId("header-cell").filter({ hasText: CE_NAME }),
    ).toHaveCount(0);
  });

  test("should handle using `case()` when referencing the same column names (metabase#14854)", async ({
    page,
  }) => {
    const CC_NAME = "CE with case";

    await visitQuestionAdhoc(page, {
      display: "table",
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          expressions: {
            [CC_NAME]: [
              "case",
              [
                [
                  [">", ["field", ORDERS.DISCOUNT, null], 0],
                  ["field", ORDERS.CREATED_AT, null],
                ],
              ],
              {
                default: [
                  "field",
                  PRODUCTS.CREATED_AT,
                  { "source-field": ORDERS.PRODUCT_ID },
                ],
              },
            ],
          },
        },
        database: SAMPLE_DB_ID,
      },
    });

    await expect(page.getByText(CC_NAME, { exact: true })).toBeVisible();
    await expect(
      page.getByText(caseSensitiveSubstring("37.65")).first(),
    ).toBeVisible();
  });

  test("should handle brackets in the name of the custom column (metabase#15316)", async ({
    page,
    mb,
  }) => {
    const { id } = await createQuestion(mb.api, {
      name: "15316",
      query: {
        "source-table": ORDERS_ID,
        expressions: { "MyCC [2027]": ["+", 1, 1] },
      },
    });
    await page.goto(`/question/${id}/notebook`);
    await expect(getNotebookStep(page, "data")).toBeVisible();

    await summarizeNotebook(page);
    await popover(page).getByText("Sum of ...", { exact: true }).click();
    await popover(page).getByText("MyCC [2027]", { exact: true }).click();

    await page
      .getByTestId("notebook-cell-item")
      .filter({ hasText: caseSensitiveSubstring("Sum of MyCC [2027]") })
      .first()
      .click();

    await popover(page).locator(".Icon-chevronleft").click();
    await popover(page).getByText("Custom Expression", { exact: true }).click();

    await expectCustomExpressionValue(page, "Sum([MyCC \\[2027\\]])");
  });

  test("should be able to add a date range filter to a custom column", async ({
    page,
  }) => {
    await visitQuestionAdhoc(page, {
      display: "table",
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          expressions: { CustomDate: ["field", ORDERS.CREATED_AT, null] },
        },
      },
    });

    await tableHeaderClick(page, "CustomDate");

    await popover(page).getByText("Filter by this column", { exact: true }).click();
    await popover(page).getByText("Fixed date range…", { exact: true }).click();
    await popover(page).getByLabel("Start date", { exact: true }).fill("12/10/2027");
    await popover(page).getByLabel("End date", { exact: true }).fill("01/05/2028");

    const dataset = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/dataset",
    );
    await popover(page)
      .getByRole("button", { name: "Add filter", exact: true })
      .click();
    await dataset;

    await expect(page.getByTestId("question-row-count")).toBeVisible();
    await expect(page.getByTestId("question-row-count")).toHaveText(
      "Showing 487 rows",
    );

    await expect(page.getByTestId("filter-pill")).toHaveText(
      "CustomDate is Dec 10, 2027 – Jan 5, 2028",
    );
  });

  test("should work with relative date filter applied to a custom column (metabase#16273)", async ({
    page,
  }) => {
    await openOrders(page);
    await addCustomColumn(page);

    await enterCustomColumnDetails(page, {
      formula: "case([Discount] > 0, [Created At], [Product → Created At])",
      name: "MiscDate",
    });
    await popover(page).getByRole("button", { name: "Done", exact: true }).click();

    await filterNotebook(page);
    await popover(page).getByText("MiscDate", { exact: true }).click();
    await popover(page).getByText("Relative date range…", { exact: true }).click();
    await popover(page).getByText("Previous", { exact: true }).click();
    await (await findByDisplayValue(popover(page), "days")).click();

    await page.getByRole("listbox").getByText("years", { exact: true }).click();

    await popover(page).getByLabel("Include this year", { exact: true }).click();
    await popover(page)
      .getByRole("button", { name: "Add filter", exact: true })
      .click();

    const response = await visualize(page);
    const body = await response.json();
    expect(body.error).toBeFalsy();

    await expect(
      queryBuilderMain(page).getByText("MiscDate", { exact: true }),
    ).toBeVisible();
    await expect(
      page
        .getByTestId("qb-filters-panel")
        .getByText("MiscDate is in the previous 30 years or this year", {
          exact: true,
        }),
    ).toBeVisible();
  });

  test("should allow indenting using Tab", async ({ page }) => {
    await openOrders(page);
    await addCustomColumnByLabel(page);

    await enterCustomColumnDetails(page, { formula: "1 + 2", blur: false });

    // Tab should insert indentation
    await page.keyboard.press("Tab");
    await expectCustomExpressionValue(page, "1 + 2  ");
  });

  test("should not format expression when pressing tab in the editor", async ({
    page,
  }) => {
    await openOrders(page);
    await addCustomColumnByLabel(page);

    await enterCustomColumnDetails(page, { formula: "1+1" });

    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");

    // `1+1` (3 chars) is NOT reformatted to `1 + 1` (5 chars)
    await expectCustomExpressionValue(page, "1+1");
    await customExpressionEditorType(page, "2");

    // Caret is at the end after refocusing, so "2" appends: `1+12`.
    await expectCustomExpressionValue(page, "1+12");
  });

  test("should format expression when clicking the format button", async ({
    page,
  }) => {
    await openOrders(page);
    await addCustomColumnByLabel(page);

    await enterCustomColumnDetails(page, { formula: "1+1" });

    // `1+1` (3 chars) is reformatted to `1 + 1` (5 chars)
    await formatExpression(page);
    await expectCustomExpressionValue(page, "1 + 1");
    await customExpressionEditorType(page, "2");

    await expectCustomExpressionValue(page, "1 + 12");
  });

  test("should format the expression when pressing the format keyboard shortcut", async ({
    page,
  }) => {
    await openOrders(page);
    await addCustomColumnByLabel(page);

    await enterCustomColumnDetails(page, { formula: "1+1" });

    // `1+1` (3 chars) is reformatted to `1 + 1` (5 chars)
    await focusCustomExpressionEditor(page);
    await expect(formatButton(page)).toBeVisible();
    await pressFormatShortcut(page);
    await expectCustomExpressionValue(page, "1 + 1");

    // Make sure the cursor is at the end of the expression
    await customExpressionEditorType(page, "2");
    await expectCustomExpressionValue(page, "1 + 12");
  });

  test("should not try formatting the expression when it's invalid using the keyboard shortcut", async ({
    page,
  }) => {
    await openOrders(page);
    await addCustomColumnByLabel(page);

    await enterCustomColumnDetails(page, { formula: "1+" });

    await focusCustomExpressionEditor(page);
    await pressFormatShortcut(page);
    await expectCustomExpressionValue(page, "1+");

    // Make sure the cursor is at the end of the expression
    await customExpressionEditorType(page, "2");
    await expectCustomExpressionValue(page, "1+2");
  });

  test("should format long expressions on multiple lines", async ({ page }) => {
    await openOrders(page);
    await addCustomColumnByLabel(page);

    await enterCustomColumnDetails(page, {
      formula:
        "concat(coalesce([Product → Created At], [Created At]), 'foo', 'bar')",
    });
    await formatExpression(page);

    await expectCustomExpressionValue(
      page,
      [
        "concat(",
        "  coalesce([Product → Created At], [Created At]),",
        '  "foo",',
        '  "bar"',
        ")",
      ].join("\n"),
    );
  });

  test("should not allow formatting when the expression contains an error", async ({
    page,
  }) => {
    await openOrders(page);
    await addCustomColumnByLabel(page);

    await enterCustomColumnDetails(page, { formula: "concat('foo', " });
    await expect(formatButton(page)).toHaveCount(0);
  });

  test("should show the format button when the expression editor is empty", async ({
    page,
  }) => {
    await openOrders(page);
    await addCustomColumnByLabel(page);
    await expect(formatButton(page)).toHaveCount(0);
  });

  test("should not allow saving the expression when it is invalid", async ({
    page,
  }) => {
    await openOrders(page);
    await addCustomColumnByLabel(page);

    await enterCustomColumnDetails(page, {
      formula: "concat('foo', ",
      name: "A custom expression",
    });

    await expect(
      expressionEditorWidget(page).getByRole("button", {
        name: "Done",
        exact: true,
      }),
    ).toBeDisabled();
    await customExpressionName(page).focus();
    await page.keyboard.press("Enter");
    await expect(expressionEditorWidget(page)).toBeVisible();
  });

  test("should validate the expression when typing", async ({ page }) => {
    await openOrders(page);
    await addCustomColumnByLabel(page);

    await enterCustomColumnDetails(page, {
      formula: "concat('foo', ",
      name: "A custom expression",
    });
    await expect(
      expressionEditorWidget(page).getByRole("button", {
        name: "Done",
        exact: true,
      }),
    ).toBeDisabled();

    // Fix the expression
    await customExpressionEditorType(page, "{leftarrow}'bar')");
    await expect(
      expressionEditorWidget(page).getByRole("button", {
        name: "Done",
        exact: true,
      }),
    ).not.toBeDisabled();
  });

  test("should allow choosing a suggestion with Tab", async ({ page }) => {
    await openOrders(page);
    await addCustomColumnByLabel(page);

    await enterCustomColumnDetails(page, { formula: "[Cre", blur: false });

    await expect(
      page.getByTestId("custom-expression-editor-suggestions"),
    ).toBeVisible();

    // Suggestion popover shows up and Tab selects the first one
    await page.keyboard.press("Tab");

    // Focus remains on the expression editor
    await expect(page.locator(":focus")).toHaveAttribute("role", "textbox");
  });

  test("should be possible to use the suggestion snippet arguments", async ({
    page,
  }) => {
    await openOrders(page);
    await addCustomColumn(page);

    await typeSnippet(page, "coalesc{tab}[Tax]{tab}[User ID]", { delay: 50 });
    await expectCustomExpressionValue(page, "coalesce([Tax], [User ID])");
  });

  test("should be possible to use the suggestion templates", async ({ page }) => {
    await openOrders(page);
    await addCustomColumn(page);

    await typeSnippet(page, "coalesc{tab}", { delay: 50 });

    await typeSnippet(page, "[Tax]{tab}[User ID]", {
      focus: false,
      delay: 50,
    });
    await expectCustomExpressionValue(page, "coalesce([Tax], [User ID])");
  });

  test("should allow to use `if` function", async ({ page }) => {
    await openProducts(page);

    // custom columns
    await getNotebookStep(page, "data")
      .getByRole("button", { name: "Custom column", exact: true })
      .click();
    await enterCustomColumnDetails(page, {
      formula: 'if([ID] = 1, "First", [ID] = 2, "Second", "Other")',
      name: "If",
    });
    await expressionEditorWidget(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();
    await getNotebookStep(page, "expression")
      .getByRole("button", { name: "Filter", exact: true })
      .click();
    await clauseStepPopover(page).getByText("If", { exact: true }).click();
    await selectFilterOperator(page, "Is");
    await clauseStepPopover(page)
      .getByPlaceholder("Enter some text", { exact: true })
      .fill("Other");
    await clauseStepPopover(page)
      .getByRole("button", { name: "Add filter", exact: true })
      .click();
    await visualize(page);
    await assertQueryBuilderRowCount(page, 198);
    await openNotebook(page);
    await removeNotebookClauseByText(
      getNotebookStep(page, "filter"),
      "If is Other",
    );
    await removeNotebookClauseByText(getNotebookStep(page, "expression"), "If");

    // filters
    await getNotebookStep(page, "data")
      .getByRole("button", { name: "Filter", exact: true })
      .click();
    await clauseStepPopover(page)
      .getByText("Custom Expression", { exact: true })
      .click();
    await enterCustomColumnDetails(page, {
      formula: 'if([Category] = "Gadget", 1, [Category] = "Widget", 2) = 2',
    });
    await clauseStepPopover(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();
    await visualize(page);
    await assertQueryBuilderRowCount(page, 54);
    await openNotebook(page);
    await removeNotebookClauseByText(
      getNotebookStep(page, "filter"),
      "If is equal to 2",
    );

    // aggregations
    await getNotebookStep(page, "data")
      .getByRole("button", { name: "Summarize", exact: true })
      .click();
    await clauseStepPopover(page)
      .getByText("Custom Expression", { exact: true })
      .click();
    await enterCustomColumnDetails(page, {
      formula: 'sum(if([Category] = "Gadget", 1, 2))',
      name: "SumIf",
    });
    await clauseStepPopover(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();
    await visualize(page);
    await expect(page.getByTestId("scalar-value")).toHaveText("347");
  });

  test("should allow to use `in` and `notIn` functions", async ({ page }) => {
    await openProducts(page);

    // custom columns - in
    await getNotebookStep(page, "data")
      .getByRole("button", { name: "Custom column", exact: true })
      .click();
    await enterCustomColumnDetails(page, {
      formula: 'in("Gadget", [Vendor], [Category])',
      name: "InColumn",
    });
    await expressionEditorWidget(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();
    await getNotebookStep(page, "expression")
      .getByRole("button", { name: "Filter", exact: true })
      .click();
    await clauseStepPopover(page).getByText("InColumn", { exact: true }).click();
    await clauseStepPopover(page).getByText("Add filter", { exact: true }).click();
    await visualize(page);
    await assertQueryBuilderRowCount(page, 53);

    // custom columns - notIn
    await openNotebook(page);
    await getNotebookStep(page, "expression")
      .getByText("InColumn", { exact: true })
      .click();
    await enterCustomColumnDetails(page, {
      formula: 'notIn("Gadget", [Vendor], [Category])',
      name: "InColumn",
    });
    await expressionEditorWidget(page)
      .getByRole("button", { name: "Update", exact: true })
      .click();
    await visualize(page);
    await assertQueryBuilderRowCount(page, 147);

    // filters - in
    await openNotebook(page);
    await removeNotebookClauseByText(
      getNotebookStep(page, "expression"),
      "InColumn",
    );
    await getNotebookStep(page, "data")
      .getByRole("button", { name: "Filter", exact: true })
      .click();
    await clauseStepPopover(page)
      .getByText("Custom Expression", { exact: true })
      .click();
    await enterCustomColumnDetails(page, { formula: "in([ID], 1, 2, 3)" });
    await clauseStepPopover(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();
    await visualize(page);
    await assertQueryBuilderRowCount(page, 3);
    await openNotebook(page);
    await getNotebookStep(page, "filter")
      .getByText("ID is 3 selections", { exact: true })
      .click();
    await clauseStepPopover(page)
      .getByText("3", { exact: true })
      .locator("xpath=following-sibling::button[1]")
      .click();
    await clauseStepPopover(page)
      .getByRole("button", { name: "Update filter", exact: true })
      .click();
    await visualize(page);
    await assertQueryBuilderRowCount(page, 2);

    // filters - notIn
    await openNotebook(page);
    await getNotebookStep(page, "filter")
      .getByText("ID is 2 selections", { exact: true })
      .click();
    await clauseStepPopover(page).getByLabel("Back", { exact: true }).click();
    await clauseStepPopover(page)
      .getByText("Custom Expression", { exact: true })
      .click();
    await enterCustomColumnDetails(page, { formula: "notIn([ID], 1, 2, 3)" });
    await clauseStepPopover(page)
      .getByRole("button", { name: "Update", exact: true })
      .click();
    await visualize(page);
    await assertQueryBuilderRowCount(page, 197);

    // aggregations - in
    await openNotebook(page);
    await removeNotebookClauseByText(
      getNotebookStep(page, "filter"),
      "ID is not 3 selections",
    );
    await getNotebookStep(page, "data")
      .getByRole("button", { name: "Summarize", exact: true })
      .click();
    await clauseStepPopover(page)
      .getByText("Custom Expression", { exact: true })
      .click();
    await enterCustomColumnDetails(page, {
      formula: "countIf(in([ID], 1, 2))",
      name: "CountIfIn",
    });
    await clauseStepPopover(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();
    await visualize(page);
    await expect(page.getByTestId("scalar-value")).toHaveText("2");

    // aggregations - notIn
    await openNotebook(page);
    await getNotebookStep(page, "summarize")
      .getByText("CountIfIn", { exact: true })
      .click();
    await enterCustomColumnDetails(page, {
      formula: "countIf(notIn([ID], 1, 2))",
      name: "CountIfIn",
    });
    await expressionEditorWidget(page)
      .getByRole("button", { name: "Update", exact: true })
      .click();
    await visualize(page);
    await expect(page.getByTestId("scalar-value")).toHaveText("198");
  });

  test("should handle expression references", async ({ page }) => {
    await openProducts(page);

    await getNotebookStep(page, "data")
      .getByRole("button", { name: "Custom column", exact: true })
      .click();
    await enterCustomColumnDetails(page, { formula: "[Price]", name: "Foo" });
    await expressionEditorWidget(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();

    await getNotebookStep(page, "expression").locator(".Icon-add").click();
    await enterCustomColumnDetails(page, { formula: "[Foo]", name: "Bar" });
    await expressionEditorWidget(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();

    await getNotebookStep(page, "expression").locator(".Icon-add").click();
    await enterCustomColumnDetails(page, { formula: "[Bar]", name: "Quu" });
    await expressionEditorWidget(page)
      .getByRole("button", { name: "Done", exact: true })
      .click();

    await getNotebookStep(page, "expression")
      .getByText("Foo", { exact: true })
      .click();
    await expectCustomExpressionValue(page, "[Price]");
    await expressionEditorWidget(page)
      .getByRole("button", { name: "Cancel", exact: true })
      .click();

    await getNotebookStep(page, "expression")
      .getByText("Bar", { exact: true })
      .click();
    await expectCustomExpressionValue(page, "[Foo]");
    await expressionEditorWidget(page)
      .getByRole("button", { name: "Cancel", exact: true })
      .click();

    await getNotebookStep(page, "expression")
      .getByText("Quu", { exact: true })
      .click();
    await expectCustomExpressionValue(page, "[Bar]");
  });
});
