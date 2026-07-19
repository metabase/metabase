/**
 * Playwright port of
 * e2e/test/scenarios/question/offset.cy.spec.ts (no gating tags upstream —
 * runs in OSS and EE).
 *
 * The offset() aggregation/expression: trailing values, period-over-period,
 * in breakouts and custom columns.
 *
 * Notes on the port:
 * - `cy.button(name)` is `findByRole("button", { name })` (exact) →
 *   getByRole("button", { name, exact: true }).
 * - `cy.intercept("POST","/api/card").as("saveQuestion")` +
 *   `cy.wait("@saveQuestion")` collapse into support/offset.ts `saveQuestion`,
 *   which registers the waitForResponse before the modal Save (PORTING rule 2).
 * - The expression editor is CodeMirror — driven via the shared notebook.ts
 *   `enterCustomColumnDetails` (native keyboard). `cy.realPress("Tab")` →
 *   page.keyboard.press("Tab").
 * - The two `{ tags: "@skip" }` tests upstream are disabled ("we want to
 *   disable offset() in custom columns for now") — ported faithfully as
 *   test.skip.
 * - Field/aggregation/breakout refs are plain object literals (the query is a
 *   Record<string, unknown> on this side; the metabase-types annotations are
 *   dropped, behaviour unchanged).
 */
import { expect, test } from "../support/fixtures";
import { openTable } from "../support/ad-hoc-question";
import { echartsContainer } from "../support/charts";
import {
  addSummaryGroupingField,
  summarizeNotebook,
} from "../support/joins";
import {
  customExpressionCompletion,
  customExpressionCompletions,
  customExpressionName,
} from "../support/custom-column-3";
import {
  enterCustomColumnDetails,
  expressionEditorWidget,
  getNotebookStep,
  miniPicker,
  openNotebook,
  startNewQuestion,
  visualize,
} from "../support/notebook";
import {
  addBreakout,
  addCustomAggregation,
  createOffsetOptions,
  saveQuestion,
  verifyInvalidColumnName,
  verifyLineChart,
  verifyNoQuestionError,
  verifyTableContent,
} from "../support/offset";
import { createQuestion } from "../support/factories";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { caseSensitiveSubstring } from "../support/text";
import { popover, visitQuestion } from "../support/ui";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const ORDERS_ID_FIELD_REF = ["field", ORDERS.ID, { "base-type": "type/BigInteger" }];

const ORDERS_TOTAL_FIELD_REF = ["field", ORDERS.TOTAL, { "base-type": "type/Float" }];

const ORDERS_CREATED_AT_BREAKOUT = [
  "field",
  ORDERS.CREATED_AT,
  { "base-type": "type/DateTime", "temporal-unit": "month" },
];

const SUM_TOTAL_AGGREGATION = ["sum", ORDERS_TOTAL_FIELD_REF];

const OFFSET_SUM_TOTAL_AGGREGATION_NAME = "Offsetted sum of total";

const OFFSET_SUM_TOTAL_AGGREGATION = [
  "offset",
  createOffsetOptions(OFFSET_SUM_TOTAL_AGGREGATION_NAME),
  SUM_TOTAL_AGGREGATION,
  -1,
];

test.describe("scenarios > question > offset", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test.describe("custom columns", () => {
    // This test contradicts the next 2 skipped ones.
    // Remove it once we enable offset() in custom columns.
    test("does not suggest or allow using offset()", async ({ page, mb }) => {
      const expression = "Offset([Total], -1)";
      const prefixLength = 3;
      const prefix = expression.substring(0, prefixLength);

      const card = await createQuestion(mb.api, {
        query: {
          "source-table": ORDERS_ID,
          fields: [ORDERS_ID_FIELD_REF, ORDERS_TOTAL_FIELD_REF],
          limit: 5,
          "order-by": [["asc", ORDERS_TOTAL_FIELD_REF]],
        },
      });
      await visitQuestion(page, card.id);
      await openNotebook(page);
      await page
        .getByRole("button", { name: "Custom column", exact: true })
        .click();
      await enterCustomColumnDetails(page, { formula: prefix });

      // does not suggest offset() in custom columns
      await expect(customExpressionCompletions(page)).toHaveCount(0);

      await enterCustomColumnDetails(page, { formula: expression });
      await page.keyboard.press("Tab");

      const widget = expressionEditorWidget(page);
      await expect(
        widget.getByRole("button", { name: "Done", exact: true }),
      ).toBeDisabled();
      await expect(
        widget.getByText("OFFSET is not supported in custom columns", {
          exact: true,
        }),
      ).toBeVisible();
    });

    // Skipped because we want to disable offset() in custom columns for now
    test.skip("suggests and allows using offset()", async ({ page, mb }) => {
      const expression = "Offset([Total], -1)";
      const prefixLength = 3;
      const prefix = expression.substring(0, prefixLength);

      const card = await createQuestion(mb.api, {
        query: {
          "source-table": ORDERS_ID,
          fields: [ORDERS_ID_FIELD_REF, ORDERS_TOTAL_FIELD_REF],
          limit: 5,
        },
      });
      await visitQuestion(page, card.id);
      await openNotebook(page);
      await page
        .getByRole("button", { name: "Custom column", exact: true })
        .click();
      await enterCustomColumnDetails(page, { formula: prefix });

      // suggests offset() in custom column expressions
      await expect(
        page.getByTestId("expression-suggestions-list-item"),
      ).toHaveText("Offset");

      await enterCustomColumnDetails(page, { formula: expression });
      await page.keyboard.press("Tab");

      await popover(page)
        .getByText("OFFSET in a custom expression requires a sort order")
        .waitFor();
      await expect(
        popover(page).getByRole("button", { name: "Done", exact: true }),
      ).toBeDisabled();
      await popover(page)
        .getByRole("button", { name: "Cancel", exact: true })
        .click();

      await page.getByRole("button", { name: "Sort", exact: true }).click();
      await popover(page).getByText("ID", { exact: true }).click();
      await getNotebookStep(page, "expression").locator(".Icon-add").click();
      await enterCustomColumnDetails(page, { formula: expression });
      await page.keyboard.press("Tab");

      await expect(
        popover(page).getByRole("button", { name: "Done", exact: true }),
      ).toBeDisabled();
      await popover(page)
        .getByPlaceholder("Something nice and descriptive")
        .fill("My expression");
      await popover(page).getByPlaceholder("Something nice and descriptive").blur();
      await popover(page).getByRole("button", { name: "Done", exact: true }).click();

      // preview availability
      await expect(
        getNotebookStep(page, "data").locator(".Icon-play"),
      ).toBeVisible();
      await expect(
        getNotebookStep(page, "expression").locator(".Icon-play"),
      ).toBeHidden();
      await expect(
        getNotebookStep(page, "sort").locator(".Icon-play"),
      ).toBeVisible();
      await expect(
        getNotebookStep(page, "limit").locator(".Icon-play"),
      ).toBeVisible();

      await visualize(page);
      await verifyTableContent(page, [
        ["1", "39.72", ""],
        ["2", "117.03", "39.72"],
        ["3", "49.21", "117.03"],
      ]);
    });

    // Skipped because we want to disable offset() in custom columns for now
    test.skip("does not allow to use offset-based column in other clauses (metabase#42764)", async ({
      page,
      mb,
    }) => {
      const offsettedColumnName = "xyz";
      const expression = `Offset([${offsettedColumnName}], -1)`;
      const prefixLength = "Offset([x".length;
      const prefix = expression.substring(0, prefixLength);

      const card = await createQuestion(mb.api, {
        query: {
          "source-table": ORDERS_ID,
          expressions: {
            [offsettedColumnName]: [
              "offset",
              createOffsetOptions(offsettedColumnName),
              ORDERS_TOTAL_FIELD_REF,
              -1,
            ],
          },
          "order-by": [["asc", ORDERS_ID_FIELD_REF]],
          limit: 5,
        },
      });
      await visitQuestion(page, card.id);

      // custom column drills
      const rowIndex = 1;
      const columnIndex = 9;
      const columnsCount = 10;
      const cellIndex = rowIndex * columnsCount + columnIndex;
      await page.getByRole("gridcell").nth(cellIndex).click();
      await expect(popover(page)).toHaveCount(0);

      await openNotebook(page);

      // custom column expressions
      await getNotebookStep(page, "expression").locator(".Icon-add").click();
      await verifyInvalidColumnName(page, offsettedColumnName, prefix, expression);
      await popover(page)
        .getByRole("button", { name: "Cancel", exact: true })
        .click();

      // custom filter expressions
      await page.locator(".Icon-filter").click();
      await popover(page).getByText("Custom Expression", { exact: true }).click();
      await verifyInvalidColumnName(page, offsettedColumnName, prefix, expression);
      await popover(page)
        .getByRole("button", { name: "Cancel", exact: true })
        .click();
      await page.keyboard.press("Escape");

      // custom aggregation expressions
      await page.locator(".Icon-sum").click();
      await popover(page).getByText("Custom Expression", { exact: true }).click();
      await verifyInvalidColumnName(page, offsettedColumnName, prefix, expression);
      await popover(page)
        .getByRole("button", { name: "Cancel", exact: true })
        .click();
      await page.keyboard.press("Escape");

      // sort clause
      await getNotebookStep(page, "sort").locator(".Icon-add").click();
      await expect(popover(page)).not.toContainText(offsettedColumnName);
    });
  });

  test.describe("filters", () => {
    test("does not suggest or allow using offset()", async ({ page, mb }) => {
      const expression = "Offset([Total], -1) > 0";
      const prefixLength = 3;
      const prefix = expression.substring(0, prefixLength);

      const card = await createQuestion(mb.api, {
        query: {
          "source-table": ORDERS_ID,
          limit: 5,
        },
      });
      await visitQuestion(page, card.id);
      await openNotebook(page);
      await page.getByRole("button", { name: "Filter", exact: true }).click();
      await popover(page).getByText("Custom Expression", { exact: true }).click();
      await enterCustomColumnDetails(page, { formula: prefix });

      // does not suggest offset() in filter expressions
      await expect(customExpressionCompletions(page)).toHaveCount(0);

      await enterCustomColumnDetails(page, { formula: expression });
      await page.keyboard.press("Tab");

      const widget = expressionEditorWidget(page);
      await expect(
        widget.getByRole("button", { name: "Done", exact: true }),
      ).toBeDisabled();
      await expect(
        widget.getByText("OFFSET is not supported in custom filters", {
          exact: true,
        }),
      ).toBeVisible();
    });
  });

  test.describe("aggregations", () => {
    test("suggests and allows using offset()", async ({ page, mb }) => {
      const expression = "Offset(Sum([Total]), -1)";
      const prefixLength = 3;
      const prefix = expression.substring(0, prefixLength);

      const card = await createQuestion(mb.api, {
        query: {
          "source-table": ORDERS_ID,
          limit: 5,
        },
      });
      await visitQuestion(page, card.id);
      await openNotebook(page);
      await page.getByRole("button", { name: "Summarize", exact: true }).click();
      await getNotebookStep(page, "summarize")
        .getByText("Pick a function or metric", { exact: true })
        .click();
      await popover(page).getByText("Custom Expression", { exact: true }).click();
      await enterCustomColumnDetails(page, { formula: prefix, blur: false });

      // suggests offset() in aggregation expressions
      await expect(customExpressionCompletions(page)).toBeVisible();
      await expect(customExpressionCompletion(page, "Offset")).toBeAttached();

      await enterCustomColumnDetails(page, { formula: expression, blur: false });
      await page.keyboard.press("Tab");

      const widget = expressionEditorWidget(page);
      await expect(
        widget.getByRole("button", { name: "Done", exact: true }),
      ).toBeDisabled();

      await customExpressionName(page).fill("My expression");
      await customExpressionName(page).blur();

      await expect(
        widget.getByRole("button", { name: "Done", exact: true }),
      ).toBeEnabled();
    });

    test("works with a single breakout", async ({ page, mb }) => {
      const card = await createQuestion(mb.api, {
        query: {
          "source-table": ORDERS_ID,
          aggregation: [OFFSET_SUM_TOTAL_AGGREGATION],
          breakout: [ORDERS_CREATED_AT_BREAKOUT],
          limit: 5,
        },
      });
      await visitQuestion(page, card.id);

      await verifyNoQuestionError(page);
      await verifyTableContent(page, [
        ["April 2025", ""],
        ["May 2025", "52.76"],
      ]);

      await openNotebook(page);
      await expect(
        getNotebookStep(page, "summarize").locator(".Icon-play"),
      ).toBeVisible();
    });

    test("works after saving a question (metabase#42323)", async ({ page }) => {
      const breakoutName = "Created At";

      await startNewQuestion(page);
      await miniPicker(page).getByText("Sample Database", { exact: true }).click();
      await miniPicker(page).getByText("Orders", { exact: true }).click();
      await addCustomAggregation(page, {
        formula: "Offset(Sum([Total]), -1)",
        name: OFFSET_SUM_TOTAL_AGGREGATION_NAME,
        isFirst: true,
      });
      await addBreakout(page, breakoutName);

      await visualize(page);
      await verifyNoQuestionError(page);
      await verifyLineChart(page, {
        xAxis: breakoutName + ": Month",
        yAxis: OFFSET_SUM_TOTAL_AGGREGATION_NAME,
      });

      const response = await saveQuestion(page);
      const { id } = (await response.json()) as { id: number };
      await visitQuestion(page, id);
      await verifyNoQuestionError(page);
      await verifyLineChart(page, {
        xAxis: breakoutName + ": Month",
        yAxis: OFFSET_SUM_TOTAL_AGGREGATION_NAME,
      });
    });

    test("should create filter and CC with offset aggregation and sort correctly", async ({
      page,
    }) => {
      await openTable(page, { table: ORDERS_ID });

      await openNotebook(page);

      await summarizeNotebook(page);
      await addCustomAggregation(page, {
        formula: "Offset(Sum([Total]), -1)",
        name: OFFSET_SUM_TOTAL_AGGREGATION_NAME,
        isOpened: true,
      });

      await addSummaryGroupingField(page, { field: "Created At" });
      await addSummaryGroupingField(page, {
        table: "Product",
        field: "Category",
      });
      await page.getByLabel("Custom column", { exact: true }).last().click();

      await enterCustomColumnDetails(page, {
        formula: `[${OFFSET_SUM_TOTAL_AGGREGATION_NAME}] * 2`,
        name: `${OFFSET_SUM_TOTAL_AGGREGATION_NAME} * 2`,
      });
      await popover(page).getByText("Done", { exact: true }).click();

      await page
        .getByTestId("action-buttons")
        .last()
        .locator(".Icon-filter")
        .click();
      await popover(page).getByText("Custom Expression", { exact: true }).click();

      await enterCustomColumnDetails(page, {
        formula: `[${OFFSET_SUM_TOTAL_AGGREGATION_NAME}] > 1000`,
      });
      await popover(page).getByText("Done", { exact: true }).click();

      await page
        .getByTestId("action-buttons")
        .last()
        .locator(".Icon-sort")
        .click();
      await popover(page)
        .getByText(OFFSET_SUM_TOTAL_AGGREGATION_NAME, { exact: true })
        .click();
      await getNotebookStep(page, "sort", { stage: 1, index: 0 })
        .getByText(OFFSET_SUM_TOTAL_AGGREGATION_NAME, { exact: true })
        .click();

      await visualize(page);

      await verifyNoQuestionError(page);
      await verifyTableContent(page, [
        ["April 2028", "Gadget", "15,713", "31,426.01"],
        ["September 2028", "Gadget", "15,017.31", "30,034.62"],
      ]);
    });
  });

  test("should work with metrics (metabase#47854)", async ({ page, mb }) => {
    const metricName = "Count of orders";

    const metric = await createQuestion(mb.api, {
      name: metricName,
      type: "metric",
      description: "A metric",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          [
            "field",
            ORDERS.CREATED_AT,
            { "base-type": "type/DateTime", "temporal-unit": "month" },
          ],
        ],
      },
      display: "scalar",
    });

    const question = await createQuestion(mb.api, {
      name: "Question with metric",
      type: "question",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["metric", metric.id]],
        breakout: [
          [
            "field",
            ORDERS.CREATED_AT,
            { "base-type": "type/DateTime", "temporal-unit": "month" },
          ],
        ],
      },
      display: "line",
    });
    await visitQuestion(page, question.id);

    await openNotebook(page);

    await addCustomAggregation(page, {
      formula: `Offset([${metricName}], -1)`,
      name: "Count of orders (previous month)",
    });

    await visualize(page);

    await expect(
      echartsContainer(page).getByText(caseSensitiveSubstring("January 2027")).first(),
    ).toBeVisible();
  });
});
