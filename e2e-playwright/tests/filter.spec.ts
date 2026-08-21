/**
 * Playwright port of e2e/test/scenarios/filters/filter.cy.spec.js
 *
 * Core QB filtering: add / edit / remove filters in the query builder across
 * column types, plus the custom-expression filter editor (CodeMirror
 * autocomplete, keyboard behaviour, error states, GUI↔expression conversion).
 *
 * Notes on the port:
 * - `H.filter({ mode: "notebook" })` → joins.filterNotebook; the simple-mode
 *   `H.filter()` → filter.ts filterSimple.
 * - The custom-expression editor is CodeMirror, driven by real keystrokes
 *   (page.keyboard IS CDP input, the Playwright equivalent of cy.realType).
 *   The escape-aware type / enterCustomColumnDetails / completions helpers are
 *   imported read-only from cc-typing-suggestion.ts and custom-column-3.ts;
 *   customExpressionType (filter.ts) additionally maps `→` → `->` for FK refs.
 * - `H.CustomExpressionEditor.completion(name).parent()` (the [role=option]) →
 *   custom-column-3 customExpressionCompletion, which already resolves the
 *   option element (aria-selected lives on it).
 * - Rule 1: findByText(string) → getByText(exact); cy.contains(str) →
 *   case-sensitive substring regex (text.ts caseSensitiveSubstring).
 * - Rule 2: the "@dataset" cy.wait in the case-insensitive test is registered
 *   as a waitForResponse BEFORE the Update click; the never-awaited
 *   cy.intercept in metabase#15893 is dropped.
 * - Duplicate `it` title "…(metabase#14880)" appears twice upstream (Playwright
 *   errors on duplicate titles) → the second is suffixed " (2)".
 * - metabase#15333 is upstream `{ tags: "@skip" }` → ported as test.skip
 *   (has-skips gate; body preserved).
 */
import { openReviewsTable } from "../support/ad-hoc-question";
import {
  openOrdersTable,
  openPeopleTable,
  openProductsTable,
} from "../support/ad-hoc-question";
import {
  acceptCompletion,
  blurEditor,
  enterCustomColumnDetails,
  typeExpression,
} from "../support/cc-typing-suggestion";
import { verifyNotebookQuery } from "../support/click-behavior";
import { customExpressionEditor } from "../support/custom-column";
import { removeNotebookClauseByText } from "../support/custom-column-1";
import {
  clearCustomExpressionEditor,
  customExpressionCompletion,
  customExpressionCompletions,
  expectCustomExpressionValue,
  focusCustomExpressionEditor,
  formatExpression,
} from "../support/custom-column-3";
import { pickEntity } from "../support/dashboard";
import { createQuestion } from "../support/factories";
import {
  customExpressionType,
  expectChartCirclesWithColors,
  expectFocusedRole,
  expectVisibleInPopover,
  filterSimple,
} from "../support/filter";
import { clauseStepPopover } from "../support/filters";
import { test, expect } from "../support/fixtures";
import { filterNotebook, join, joinTable, selectFilterOperator } from "../support/joins";
import {
  assertQueryBuilderRowCount,
  entityPickerModal,
  expressionEditorWidget,
  getNotebookStep,
  openNotebook,
  queryBuilderMain,
  tableHeaderClick,
  visualize,
} from "../support/notebook";
import { visitQuestionAdhoc } from "../support/permissions";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { caseSensitiveSubstring } from "../support/text";
import { icon, popover, queryBuilderHeader, visitQuestion } from "../support/ui";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, REVIEWS, REVIEWS_ID } =
  SAMPLE_DATABASE;

test.describe("scenarios > question > filter", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should filter a joined table by 'Is not' filter (metabase#13534)", async ({
    page,
  }) => {
    await openOrdersTable(page, { mode: "notebook" });

    await join(page);
    await joinTable(page, "Products");

    await filterNotebook(page);
    await popover(page).getByText("Products", { exact: true }).click();
    await popover(page).getByText("Category", { exact: true }).click();
    await popover(page).getByText("Is", { exact: true }).click();
    await page.getByRole("menu").getByText("Is not", { exact: true }).click();
    await popover(page).getByText("Gizmo", { exact: true }).click();
    await popover(page)
      .getByRole("button", { name: "Add filter", exact: true })
      .click();
    await expect(
      getNotebookStep(page, "filter").getByText(
        "Products → Category is not Gizmo",
        { exact: true },
      ),
    ).toBeVisible();

    const dataset = await visualize(page);
    const body = await dataset.json();
    expect(body.error).toBeFalsy();

    await expect(
      queryBuilderMain(page).getByText(caseSensitiveSubstring("37.65")).first(),
    ).toBeVisible();
    // one of the "Gizmo" EANs
    await expect(
      queryBuilderMain(page).getByText("3621077291879", { exact: true }),
    ).toHaveCount(0);
  });

  test("should filter based on remapped values (metabase#13235)", async ({
    page,
    mb,
  }) => {
    // set "Filtering on this field" = "A list of all values"
    await mb.api.put(`/api/field/${ORDERS.PRODUCT_ID}`, {
      has_field_values: "list",
    });
    // "Display values" = "Use foreign key" as `Product.Title`
    await mb.api.post(`/api/field/${ORDERS.PRODUCT_ID}/dimension`, {
      name: "Product ID",
      type: "external",
      human_readable_field_id: PRODUCTS.TITLE,
    });

    // Add filter as remapped Product ID (Product name)
    await openOrdersTable(page);
    await filterSimple(page);
    await popover(page).getByText("Product ID", { exact: true }).click();
    await popover(page)
      .getByText("Aerodynamic Linen Coat", { exact: true })
      .click();
    await popover(page)
      .getByRole("button", { name: "Apply filter", exact: true })
      .click();

    // Reported failing on v0.36.4 and v0.36.5.1
    await expect(page.getByTestId("loading-indicator")).toHaveCount(0);
    // one of the subtotals for this product
    await expect(page.getByText("148.23", { exact: true }).first()).toBeVisible();
    await expect(
      page.getByText("Fantastic Wool Shirt", { exact: true }),
    ).toHaveCount(0);
  });

  test("should not drop aggregated filters (metabase#11957)", async ({
    page,
    mb,
  }) => {
    const AGGREGATED_FILTER = "Count is less than or equal to 20";

    const { id } = await createQuestion(mb.api, {
      name: "11957",
      query: {
        "source-query": {
          "source-table": ORDERS_ID,
          filter: [">", ["field", ORDERS.CREATED_AT, null], "2029-01-01"],
          aggregation: [["count"]],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "day" }]],
        },
        filter: ["<=", ["field", "count", { "base-type": "type/Integer" }], 20],
      },
    });
    await visitQuestion(page, id);

    // Test shows two filters collapsed - click on number 2 to expand and show
    // filter names
    await expect(page.getByTestId("filters-visibility-control")).toHaveText("2");
    await page.getByTestId("filters-visibility-control").click();

    await expect(
      page.getByText(AGGREGATED_FILTER, { exact: true }),
    ).toBeVisible();

    await page
      .getByText(/^Created At is after/i)
      .locator(".Icon-close")
      .click();

    // **Removing or changing filters shouldn't remove aggregated filter**
    await expect(
      page.getByText(AGGREGATED_FILTER, { exact: true }),
    ).toBeVisible();
  });

  test("should display original custom expression filter with dates on subsequent click (metabase#12492)", async ({
    page,
  }) => {
    await visitQuestionAdhoc(page, {
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          filter: [
            ">",
            ["field", ORDERS.CREATED_AT, null],
            ["field", PRODUCTS.CREATED_AT, { "source-field": ORDERS.PRODUCT_ID }],
          ],
        },
        database: SAMPLE_DB_ID,
      },
      display: "table",
    });

    await page
      .getByTestId("qb-filters-panel")
      .getByText("Created At is greater than Product → Created At", {
        exact: true,
      })
      .click();

    await expect(
      popover(page)
        .getByText(caseSensitiveSubstring("[Created At] > [Product → Created At]"))
        .first(),
    ).toBeVisible();
  });

  test("should reject Enter when the filter expression is invalid", async ({
    page,
  }) => {
    await openReviewsTable(page, { mode: "notebook" });
    await filterNotebook(page);
    await popover(page).getByText("Custom Expression", { exact: true }).click();

    // there should be numbers after 'E'
    await enterCustomColumnDetails(page, { formula: "[Rating] > 2E{enter}" });

    await expect(page.getByText("Missing exponent", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Rating is greater than 2", { exact: true }),
    ).toHaveCount(0);
  });

  test("should offer case expression in the auto-complete suggestions", async ({
    page,
  }) => {
    await openExpressionEditorFromFreshlyLoadedPage(page);

    await enterCustomColumnDetails(page, { formula: "c", blur: false });

    await expect(customExpressionCompletions(page)).toContainText("case");

    // focus:false — the editor is still focused from enterCustomColumnDetails,
    // and the open completions popup overlays the editor content, so a re-focus
    // click (shared focusCustomExpressionEditor clicks center, no force) would
    // be intercepted by an option row. Upstream's focus() force-clicks the right
    // edge; typing at the existing caret is the faithful equivalent here.
    await typeExpression(page, "a", { focus: false });

    // "case" is still there after typing a bit
    await expect(customExpressionCompletions(page)).toContainText("case");
  });

  test("should enable highlighting suggestions with keyboard up and down arrows (metabase#16210)", async ({
    page,
  }) => {
    await openExpressionEditorFromFreshlyLoadedPage(page);

    await enterCustomColumnDetails(page, { formula: "c", blur: false });

    await expect(customExpressionCompletion(page, "case")).toHaveAttribute(
      "aria-selected",
      "true",
    );

    // Avoid flakiness caused by CodeMirror not accepting the keypress immediately
    await page.waitForTimeout(200);
    await page.keyboard.press("ArrowDown");

    await expect(customExpressionCompletion(page, "ceil")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(customExpressionCompletion(page, "case")).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  test("should highlight the correct matching for suggestions", async ({
    page,
  }) => {
    await openExpressionEditorFromFreshlyLoadedPage(page);

    await enterCustomColumnDetails(page, { formula: "[B", blur: false });

    await expect(customExpressionCompletion(page, "Body")).toBeVisible();

    await typeExpression(page, "{backspace}p", { focus: false });

    await expect(customExpressionCompletion(page, "Product ID")).toBeVisible();
    // The matched prefix "P" is wrapped in its own element (exact textContent
    // "P"); the remainder "roduct ID" is a bare text node beside it, so the
    // option's full textContent is "Product ID" — testing-library matched the
    // direct-text-node "roduct ID" but Playwright's exact getByText compares
    // full textContent, so use a case-sensitive substring here (mixed-content
    // text-nodes gotcha).
    await expect(
      customExpressionCompletion(page, "Product ID").getByText("P", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      customExpressionCompletion(page, "Product ID")
        .getByText(caseSensitiveSubstring("roduct ID"))
        .first(),
    ).toBeVisible();
  });

  test("should provide accurate auto-complete custom-expression suggestions based on the aggregated column name (metabase#14776)", async ({
    page,
    mb,
  }) => {
    // We need a bit taller window for this repro to see all custom filter
    // options in the popover
    await page.setViewportSize({ width: 1400, height: 1000 });
    const { id } = await createQuestion(mb.api, {
      name: "14776",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
      },
    });
    await page.goto(`/question/${id}/notebook`);

    await page.getByText("Filter", { exact: true }).first().click();
    await popover(page).getByText("Custom Expression", { exact: true }).click();
    await enterCustomColumnDetails(page, { formula: "[su", blur: false });

    await expect(
      customExpressionCompletion(page, "Sum of Total"),
    ).toBeVisible();

    await typeExpression(page, "m", { focus: false });

    await expect(
      customExpressionCompletion(page, "Sum of Total"),
    ).toBeVisible();
  });

  test("should filter using IsNull() and IsEmpty()", async ({ page }) => {
    await openReviewsTable(page, { mode: "notebook" });
    await filterNotebook(page);
    await popover(page).getByText("Custom Expression", { exact: true }).click();

    await enterCustomColumnDetails(page, { formula: "NOT IsNull([Rating])" });

    await expect(
      popover(page).getByRole("button", { name: "Done", exact: true }),
    ).toBeEnabled();
    await popover(page).getByRole("button", { name: "Done", exact: true }).click();

    await page.getByTestId("query-builder-root").locator(".Icon-add").first().click();

    await popover(page).getByText("Custom Expression", { exact: true }).click();

    await enterCustomColumnDetails(page, { formula: "NOT IsEmpty([Reviewer])" });

    await expect(
      popover(page).getByRole("button", { name: "Done", exact: true }),
    ).toBeEnabled();
    await popover(page).getByRole("button", { name: "Done", exact: true }).click();

    // check that filter is applied and rows displayed
    await visualize(page);

    await assertQueryBuilderRowCount(page, 1112);
  });

  test("should convert 'is empty' on a text column to a custom expression using IsEmpty()", async ({
    page,
  }) => {
    await openReviewsTable(page);
    await tableHeaderClick(page, "Reviewer");
    await popover(page)
      .getByText("Filter by this column", { exact: true })
      .click();
    await selectFilterOperator(page, "Is empty");
    await popover(page).getByText("Add filter", { exact: true }).click();

    // filter out everything
    await assertQueryBuilderRowCount(page, 0);

    // change the corresponding custom expression
    await page.getByText("Reviewer is empty", { exact: true }).click();
    await page.locator(".Icon-chevronleft").click();
    await popover(page).getByText("Custom Expression", { exact: true }).click();
    await expect(customExpressionEditor(page)).toContainText("isEmpty([Reviewer])");
    await enterCustomColumnDetails(page, { formula: "NOT IsEmpty([Reviewer])" });

    await page.getByRole("button", { name: "Update", exact: true }).click();
    await assertQueryBuilderRowCount(page, 1112);
  });

  test("should convert 'is empty' on a numeric column to a custom expression using IsNull()", async ({
    page,
  }) => {
    await openReviewsTable(page);
    await tableHeaderClick(page, "Rating");
    await popover(page)
      .getByText("Filter by this column", { exact: true })
      .click();
    await selectFilterOperator(page, "Is empty");
    await popover(page).getByText("Add filter", { exact: true }).click();

    // filter out everything
    await assertQueryBuilderRowCount(page, 0);

    // change the corresponding custom expression
    await page.getByText("Rating is empty", { exact: true }).click();
    await page.locator(".Icon-chevronleft").click();
    await popover(page).getByText("Custom Expression", { exact: true }).click();
    await expect(customExpressionEditor(page)).toContainText("isNull([Rating])");
    await enterCustomColumnDetails(page, {
      formula: "NOT IsNull([Rating])",
      delay: 50,
    });
    await expect(
      page.getByRole("button", { name: "Update", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Update", exact: true }).click();
    await assertQueryBuilderRowCount(page, 1112);
  });

  test("should convert negative filter to custom expression (metabase#14880)", async ({
    page,
  }) => {
    await visitQuestionAdhoc(page, {
      dataset_query: {
        type: "query",
        query: {
          "source-table": PRODUCTS_ID,
          filter: [
            "does-not-contain",
            ["field", PRODUCTS.TITLE, null],
            "Wallet",
            { "case-sensitive": false },
          ],
        },
        database: SAMPLE_DB_ID,
      },
      display: "table",
    });

    await page.getByText("Title does not contain Wallet", { exact: true }).click();
    await page.locator(".Icon-chevronleft").click();
    await popover(page).getByText("Custom Expression", { exact: true }).click();
    await expect(customExpressionEditor(page)).toContainText(
      'doesNotContain([Title], "Wallet", "case-insensitive")',
    );
  });

  test("should convert negative filter to custom expression (metabase#14880) (2)", async ({
    page,
  }) => {
    await visitQuestionAdhoc(page, {
      dataset_query: {
        type: "query",
        query: {
          "source-table": PRODUCTS_ID,
          filter: [
            "does-not-contain",
            ["field", PRODUCTS.TITLE, null],
            "Wallet",
            { "case-sensitive": false },
          ],
        },
        database: SAMPLE_DB_ID,
      },
      display: "table",
    });

    await page.getByText("Title does not contain Wallet", { exact: true }).click();
    await page.locator(".Icon-chevronleft").click();
    await popover(page).getByText("Custom Expression", { exact: true }).click();

    // Before we implement this feature, we can only assert that the input field
    // for custom expression doesn't show at all
    await focusCustomExpressionEditor(page);
    await expect(customExpressionEditor(page)).toBeVisible();
  });

  test("should be able to convert time interval filter to custom expression (metabase#12457)", async ({
    page,
  }) => {
    await openOrdersTable(page, { mode: "notebook" });

    await filterNotebook(page);
    await popover(page).getByText("Created At", { exact: true }).click();
    await popover(page).getByText("Relative date range…", { exact: true }).click();
    await popover(page).getByText("Previous", { exact: true }).click();
    await popover(page).getByLabel(/^Include/).click();
    await popover(page)
      .getByRole("button", { name: "Add filter", exact: true })
      .click();

    await getNotebookStep(page, "filter")
      .getByText("Created At is in the previous 30 days or today", {
        exact: true,
      })
      .click();

    await clauseStepPopover(page).getByRole("button", { name: "Back", exact: true }).click();
    await clauseStepPopover(page).getByRole("button", { name: "Back", exact: true }).click();
    await clauseStepPopover(page)
      .getByText("Custom Expression", { exact: true })
      .click();
    await clauseStepPopover(page)
      .getByRole("button", { name: "Update", exact: true })
      .click();

    // Back to GUI and "Include today" should be still checked
    await getNotebookStep(page, "filter")
      .getByText("Created At is in the previous 30 days or today", {
        exact: true,
      })
      .click();

    await expect(
      popover(page).getByTestId("include-current-interval-option"),
    ).toHaveAttribute("aria-checked", "true");
  });

  test("should be able to convert case-insensitive filter to custom expression (metabase#14959)", async ({
    page,
  }) => {
    await visitQuestionAdhoc(page, {
      dataset_query: {
        type: "query",
        query: {
          "source-table": REVIEWS_ID,
          filter: [
            "contains",
            ["field", REVIEWS.REVIEWER, null],
            "MULLER",
            { "case-sensitive": false },
          ],
        },
        database: SAMPLE_DB_ID,
      },
      display: "table",
    });

    await expect(
      page.getByText("wilma-muller", { exact: true }).first(),
    ).toBeVisible();
    await page.getByText("Reviewer contains MULLER", { exact: true }).click();
    await page.locator(".Icon-chevronleft").click();
    await popover(page).getByText("Custom Expression", { exact: true }).click();
    await expect(customExpressionEditor(page)).toContainText(
      'contains([Reviewer], "MULLER", "case-insensitive")',
    );

    const dataset = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/dataset",
    );
    await page.getByRole("button", { name: "Update", exact: true }).click();
    const body = await (await dataset).json();
    expect(body.data.rows).toHaveLength(1);

    await expect(
      page.getByText("wilma-muller", { exact: true }).first(),
    ).toBeVisible();
  });

  test("should reject a number literal", async ({ page }) => {
    await openProductsTable(page, { mode: "notebook" });
    await filterNotebook(page);
    await popover(page).getByText("Custom Expression", { exact: true }).click();
    await enterCustomColumnDetails(page, { formula: "3.14159" });
    await expect(
      popover(page).getByRole("button", { name: "Done", exact: true }),
    ).toBeDisabled();
    await expect(
      popover(page).getByText("Types are incompatible.", { exact: true }),
    ).toBeVisible();
  });

  test("should reject a string literal", async ({ page }) => {
    await openProductsTable(page, { mode: "notebook" });
    await filterNotebook(page);
    await popover(page).getByText("Custom Expression", { exact: true }).click();
    await enterCustomColumnDetails(page, { formula: '"TheAnswer"' });
    await expect(
      popover(page).getByRole("button", { name: "Done", exact: true }),
    ).toBeDisabled();
    await expect(
      popover(page).getByText("Types are incompatible.", { exact: true }),
    ).toBeVisible();
  });

  // Upstream: it(..., { tags: "@skip" }, ...) — ported faithfully as test.skip.
  test.skip("column filters should work for metrics (metabase#15333)", async ({
    page,
  }) => {
    await visitQuestionAdhoc(page, {
      dataset_query: {
        type: "query",
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
          breakout: [["field-id", PRODUCTS.CATEGORY]],
        },
        database: SAMPLE_DB_ID,
      },
      display: "table",
    });

    await page.getByTestId("cell-data").getByText("Count", { exact: true }).click();
    await page.getByText("Filter by this column", { exact: true }).click();
    await page.getByPlaceholder("Enter a number", { exact: true }).fill("42");
    await expect(
      page.getByRole("button", { name: "Update filter", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Update filter", exact: true }).click();
    await expect(page.getByText("Doohickey", { exact: true })).toBeVisible();
    await expect(page.getByText("Gizmo", { exact: true })).toHaveCount(0);
  });

  test("custom expression filter should reference fields by their name, not by their id (metabase#15748)", async ({
    page,
  }) => {
    await openOrdersTable(page, { mode: "notebook" });

    await filterNotebook(page);
    await popover(page).getByText("Custom Expression", { exact: true }).click();
    await enterCustomColumnDetails(page, { formula: "[Total] < [Subtotal]" });
    await popover(page).getByRole("button", { name: "Done", exact: true }).click();

    await expect(
      getNotebookStep(page, "filter").getByText("Total is less than Subtotal", {
        exact: true,
      }),
    ).toBeVisible();
  });

  test("custom expression filter should allow the use of parentheses in combination with logical operators (metabase#15754)", async ({
    page,
  }) => {
    await openOrdersTable(page, { mode: "notebook" });

    await filterNotebook(page);
    await popover(page).getByText("Custom Expression", { exact: true }).click();

    await typeExpression(page, "([ID] > 2 OR [Subtotal] = 100) and [Tax] < 4");
    await blurEditor(page);

    await expect(
      expressionEditorWidget(page).getByText(
        /^Expected closing parenthesis but found/,
      ),
    ).toHaveCount(0);

    await expect(
      expressionEditorWidget(page).getByRole("button", {
        name: "Done",
        exact: true,
      }),
    ).toBeEnabled();
  });

  test("custom expression filter should refuse to work with numeric value before an operator (metabase#15893)", async ({
    page,
  }) => {
    // Upstream registers cy.intercept("POST", "/api/dataset").as("dataset") but
    // never waits on it — dropped (PORTING rule 2).
    await openOrdersTable(page, { mode: "notebook" });

    await filterNotebook(page);
    await popover(page).getByText("Custom Expression", { exact: true }).click();

    await typeExpression(page, "0 < [ID]");
    await blurEditor(page);

    await expect(
      expressionEditorWidget(page).getByText("Expecting field but found 0", {
        exact: true,
      }),
    ).toBeVisible();

    await expect(
      expressionEditorWidget(page).getByRole("button", {
        name: "Done",
        exact: true,
      }),
    ).toBeDisabled();
  });

  test("should not allow switching focus with Tab", async ({ page }) => {
    await openOrdersTable(page, { mode: "notebook" });

    await filterNotebook(page);
    await popover(page).getByText("Custom Expression", { exact: true }).click();

    await typeExpression(page, "[Tax] > 0");

    // Tab does NOT switch the focus away from the editor
    await page.keyboard.press("Tab");
    await expectFocusedRole(page, "textbox");

    await expectCustomExpressionValue(page, "[Tax] > 0  ");
  });

  test("should allow choosing a suggestion with Tab", async ({ page }) => {
    await openOrdersTable(page, { mode: "notebook" });

    await filterNotebook(page);
    await popover(page).getByText("Custom Expression", { exact: true }).click();

    // Try to auto-complete Tax
    await typeExpression(page, "[Ta");

    // Suggestion popover shows up and this selects the first one ([Tax])
    await acceptCompletion(page, "Tab");

    // Focus remains on the expression editor
    await expectFocusedRole(page, "textbox");

    // Finish to complete a valid expression, i.e. [Tax] > 42
    await typeExpression(page, "> 42");

    // Tab switches the focus to the "Cancel" button
    await page.keyboard.press("Tab");

    await expectFocusedRole(page, "textbox");
    await expectCustomExpressionValue(page, "[Tax]> 42  ");
  });

  test("should allow hiding the suggestion list with Escape", async ({
    page,
  }) => {
    await openOrdersTable(page, { mode: "notebook" });
    await filterNotebook(page);
    await popover(page).getByText("Custom Expression", { exact: true }).click();

    // Try to auto-complete Tax
    await typeExpression(page, "Disc");

    await expect(customExpressionCompletions(page)).toBeVisible();

    // Esc closes the suggestion popover
    await page.keyboard.press("Escape");

    await expect(customExpressionCompletions(page)).toBeHidden();
  });

  test("should work on twice summarized questions and preserve both summaries (metabase#15620)", async ({
    page,
  }) => {
    await visitQuestionAdhoc(page, {
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "query",
        query: {
          "source-query": {
            "source-table": PRODUCTS_ID,
            aggregation: [["count"]],
            breakout: [
              ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "month" }],
            ],
          },
          aggregation: [
            ["avg", ["field", "count", { "base-type": "type/Integer" }]],
          ],
        },
      },
    });

    await expect(page.getByTestId("scalar-value")).toContainText("5.41");
    await filterSimple(page);
    await popover(page).getByText("Category", { exact: true }).click();
    await popover(page).getByText("Gizmo", { exact: true }).click();
    await popover(page)
      .getByRole("button", { name: "Apply filter", exact: true })
      .click();
    await openNotebook(page);

    await verifyNotebookQuery(page, "Products", [
      {
        filters: ["Category is Gizmo"],
        aggregations: ["Count"],
        breakouts: ["Created At: Month"],
      },
      {
        aggregations: ["Average of Count"],
      },
    ]);
  });

  test("user shouldn't need to scroll to add filter (metabase#14307)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openPeopleTable(page, { mode: "notebook" });
    await filterNotebook(page);
    await popover(page).getByText("State", { exact: true }).click({ force: true });
    await popover(page).getByText("AL", { exact: true }).click();
    await expectVisibleInPopover(
      popover(page).getByRole("button", { name: "Add filter", exact: true }),
    );
  });

  test("should retain all data series after saving a question where custom expression formula is the first metric (metabase#15882)", async ({
    page,
    mb,
  }) => {
    await visitQuestionAdhoc(page, {
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            [
              "aggregation-options",
              [
                "/",
                ["sum", ["field", ORDERS.DISCOUNT, null]],
                ["sum", ["field", ORDERS.SUBTOTAL, null]],
              ],
              { "display-name": "Discount %" },
            ],
            ["count"],
            ["avg", ["field", ORDERS.TOTAL, null]],
          ],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
        },
        type: "query",
      },
      display: "line",
    });

    await assertOnLegendLabels(page);
    await expectChartCirclesWithColors(page, ["#88BF4D", "#509EE3", "#A989C5"]);

    await queryBuilderHeader(page).getByText("Save", { exact: true }).click();
    await page
      .getByTestId("save-question-modal")
      .getByLabel(/Where do you want to save this/)
      .click();
    await pickEntity(page, { path: ["Our analytics"] });
    await entityPickerModal(page)
      .getByText("Select this collection", { exact: true })
      .click();

    const cardSaved = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/card",
    );
    await page
      .getByTestId("save-question-modal")
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await cardSaved;

    await assertOnLegendLabels(page);
    await expectChartCirclesWithColors(page, ["#88BF4D", "#509EE3", "#A989C5"]);

    async function assertOnLegendLabels(page: import("@playwright/test").Page) {
      const legendItems = page.getByTestId("legend-item");
      for (const label of ["Discount %", "Count", "Average of Total"]) {
        await expect(
          legendItems.filter({ hasText: caseSensitiveSubstring(label) }),
        ).not.toHaveCount(0);
      }
    }
  });

  test.describe("specific combination of filters can cause frontend reload or blank screen (metabase#16198)", () => {
    test("shouldn't display chosen category in a breadcrumb (metabase#16198-1)", async ({
      page,
    }) => {
      const chosenCategory = "Gizmo";

      await visitQuestionAdhoc(page, {
        dataset_query: {
          database: SAMPLE_DB_ID,
          query: {
            "source-table": PRODUCTS_ID,
            filter: [
              "and",
              ["=", ["field", PRODUCTS.CATEGORY, null], chosenCategory],
              ["=", ["field", PRODUCTS.ID, null], 1],
            ],
          },
          type: "query",
        },
      });

      await expect(page.getByTestId("head-crumbs-container")).not.toContainText(
        chosenCategory,
      );
    });

    test("adding an ID filter shouldn't cause page error and page reload (metabase#16198-2)", async ({
      page,
    }) => {
      await openOrdersTable(page, { mode: "notebook" });
      await filterNotebook(page);
      await popover(page)
        .getByText("Custom Expression", { exact: true })
        .click();
      await customExpressionType(page, "[Total] < [Product → Price]");
      await blurEditor(page);
      await formatExpression(page);
      await popover(page).getByRole("button", { name: "Done", exact: true }).click();
      // Filter currently says "Total is less than..." (may change to "Total < Price")
      await expect(
        getNotebookStep(page, "filter").getByText(/^Total/).first(),
      ).toBeVisible();
      await icon(page, "add").last().click();
      await popover(page).getByText(/^ID$/i).first().click();
      await page.getByPlaceholder("Enter an ID", { exact: true }).fill("1");
      await popover(page)
        .getByRole("button", { name: "Add filter", exact: true })
        .click();
      await expect(
        getNotebookStep(page, "filter").getByText(/^Total/).first(),
      ).toBeVisible();
      await expect(
        page.getByText("Something went wrong", { exact: true }),
      ).toHaveCount(0);
    });

    test("removing first filter in a sequence shouldn't result in an empty page (metabase#16198-3)", async ({
      page,
    }) => {
      await openOrdersTable(page, { mode: "notebook" });

      await filterNotebook(page);
      await clauseStepPopover(page).getByText("Total", { exact: true }).click();
      await selectFilterOperator(page, "Equal to");
      await clauseStepPopover(page)
        .getByPlaceholder("Enter a number", { exact: true })
        .fill("123");
      await clauseStepPopover(page)
        .getByRole("button", { name: "Add filter", exact: true })
        .click();

      await getNotebookStep(page, "filter").locator(".Icon-add").click();

      await clauseStepPopover(page)
        .getByText("Custom Expression", { exact: true })
        .click();
      await customExpressionType(page, "[Total] < [Product → Price]");
      await blurEditor(page);
      await clauseStepPopover(page)
        .getByRole("button", { name: "Done", exact: true })
        .click();

      await icon(page, "add").last().click();
      await clauseStepPopover(page).getByText(/^ID$/i).first().click();
      await page.getByPlaceholder("Enter an ID", { exact: true }).fill("1");
      await popover(page)
        .getByRole("button", { name: "Add filter", exact: true })
        .click();

      await removeNotebookClauseByText(
        getNotebookStep(page, "filter"),
        "Total is equal to 123",
      );

      await visualize(page);
    });
  });

  test("should close the dropdown but not the popover on escape when the combobox is opened", async ({
    page,
  }) => {
    const optionName = "Abbey Satterfield";
    await openPeopleTable(page, { mode: "notebook" });
    await filterNotebook(page);
    await popover(page).getByText("Name", { exact: true }).click();
    await page.getByLabel("Filter value", { exact: true }).pressSequentially("ab");
    await expect(
      page.getByRole("option", { name: optionName, exact: true }),
    ).toBeVisible();

    await page.getByLabel("Filter value", { exact: true }).press("Escape");
    await expect(
      page.getByRole("option", { name: optionName, exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByLabel("Filter value", { exact: true }),
    ).toBeVisible();
  });

  test("should render the selected item in view", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 320 });
    await openReviewsTable(page, { mode: "notebook" });
    await filterNotebook(page);

    for (let i = 0; i < 7; i++) {
      await page.keyboard.press("ArrowDown", { delay: 25 });
    }

    const tree = popover(page).getByRole("tree");
    await expect
      .poll(() => tree.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);

    await expect(
      popover(page).getByText("Created At", { exact: true }),
    ).toBeVisible();
  });

  test("should allow picking custom expressions in filter picker", async ({
    page,
  }) => {
    await openOrdersTable(page, { mode: "notebook" });
    await filterNotebook(page);
    const find = popover(page).getByPlaceholder("Find...", { exact: true });
    await find.fill("");
    await find.pressSequentially("coalesce");
    await expect(
      popover(page).getByText("Custom Expressions", { exact: true }),
    ).toBeVisible();
    await popover(page).getByText("coalesce", { exact: true }).click();

    await expectCustomExpressionValue(page, "coalesce(value1, value2)");
  });

  test("should allow selecting custom expressions in filter picker with (", async ({
    page,
  }) => {
    await openOrdersTable(page, { mode: "notebook" });
    await filterNotebook(page);
    const find = popover(page).getByPlaceholder("Find...", { exact: true });

    // typing a non-existing clause does nothing
    await find.fill("");
    await find.pressSequentially("foo(");
    await expect(customExpressionEditor(page)).toHaveCount(0);

    await find.fill("");
    await find.pressSequentially("case(");
    await expectCustomExpressionValue(page, "case(condition, output)");
  });
});

/** Port of the spec-local openExpressionEditorFromFreshlyLoadedPage. */
async function openExpressionEditorFromFreshlyLoadedPage(
  page: import("@playwright/test").Page,
) {
  await openReviewsTable(page, { mode: "notebook" });
  await filterNotebook(page);
  await popover(page).getByText("Custom Expression", { exact: true }).click();
}
