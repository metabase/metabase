/**
 * Playwright port of
 * e2e/test/scenarios/data-studio/measures/measures-queries.cy.spec.ts
 *
 * Data Studio > measures > queries: create measures (via the measure editor and
 * the API), then use them in ad-hoc questions, saved questions, models, pivot
 * tables and x-rays. Exercises the aggregation editor, custom expressions,
 * segments, offset, follow-up stages, joins-on-measure and measure refs.
 *
 * Port notes:
 * - EE measures is a token-gated feature (pro-self-hosted); the jar activates
 *   it. The whole describe is skipped without the token (PORTING rule 7).
 * - Fully jar-runnable: no external DB / email / webhook (GATES: token only).
 * - cy.intercept(...).as + cy.wait("@measureCreate") → page.waitForResponse
 *   registered before the Save click (PORTING rule 2, inside saveMeasure).
 * - findByText / findByLabelText string args are EXACT (PORTING rule 1);
 *   the "Replace original question" label is matched by the original /…/i regex.
 * - The aggregation custom-expression editor is the same CodeMirror
 *   `custom-expression-query-editor` as the notebook custom-column editor →
 *   real keystrokes (typeCustomExpression), focus asserted before typing.
 * - undoToast assertions filter to the matching toast (toasts stack; a bare
 *   testid resolve would be a strict-mode multi-match under the faster runner).
 * - verifyRowValues ports the spec's empty-cell-tolerant assertTableData
 *   verbatim (empty result cells render no cell-data testid).
 */
import { resolveToken } from "../support/api";
import { createQuestion } from "../support/factories";
import { createSegment } from "../support/filter-bulk";
import { expect, test } from "../support/fixtures";
import { createMeasure } from "../support/metrics-explorer";
import { openQuestionActions, summarize } from "../support/models";
import {
  enterCustomColumnDetails,
  getNotebookStep,
  openNotebook,
  visualize,
} from "../support/notebook";
import {
  MeasureEditor,
  blurCustomExpression,
  breakout,
  clearCustomExpression,
  customExpressionName,
  expectUndoToast,
  saveMeasure,
  startNewMeasure,
  typeCustomExpression,
  updateMeasure,
  useMeasureInAdhocQuestion,
  verifyRowValues,
  verifyScalarValue,
  visitNewMeasurePage,
} from "../support/measures-queries";
import { filterInNotebook } from "../support/metrics";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import {
  main,
  modal,
  popover,
  queryBuilderHeader,
  visitQuestion,
} from "../support/ui";

const { ORDERS_ID, ORDERS, PRODUCTS } = SAMPLE_DATABASE;

const MEASURE_NAME = "Table Measure";

const hasToken = Boolean(resolveToken("pro-self-hosted"));

test.describe("scenarios > data studio > measures > queries", () => {
  test.skip(!hasToken, "requires the pro-self-hosted EE token (measures)");

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test.describe("measures queries", () => {
    test("should create a measure with an aggregation without columns", async ({
      page,
    }) => {
      await startNewMeasure(page, { tableId: ORDERS_ID });

      await MeasureEditor.getAggregationPlaceholder(page).click();
      await popover(page).getByText("Count of rows", { exact: true }).click();

      await saveMeasure(page);
      await useMeasureInAdhocQuestion(page, { tableId: ORDERS_ID });
      await verifyScalarValue(page, "18,760");
    });

    test("should create a measure with with a column from the main data source", async ({
      page,
    }) => {
      await startNewMeasure(page, { tableId: ORDERS_ID });
      await MeasureEditor.getAggregationPlaceholder(page).click();
      await popover(page).getByText("Sum of ...", { exact: true }).click();
      await popover(page).getByText("Total", { exact: true }).click();
      await saveMeasure(page);

      await useMeasureInAdhocQuestion(page, { tableId: ORDERS_ID });
      await verifyScalarValue(page, "1,510,621.68");
    });

    test("should create a measure with with a column from the main data source using offset", async ({
      page,
    }) => {
      await startNewMeasure(page, { tableId: ORDERS_ID });
      await MeasureEditor.getAggregationPlaceholder(page).click();
      await popover(page).getByText("Custom Expression", { exact: true }).click();
      await typeCustomExpression(page, "Offset(Sum([Total]), -1)");
      await customExpressionName(page).fill("Offset Measure");
      await popover(page).getByRole("button", { name: "Done", exact: true }).click();
      await saveMeasure(page);

      await useMeasureInAdhocQuestion(page, {
        tableId: ORDERS_ID,
        async customizeQuery() {
          await breakout(page, "Created At");
        },
      });
      await verifyRowValues(page, [["April 2025"], ["May 2025", "52.76"]]);
    });

    test("should create a measure with a column from an implicit join", async ({
      page,
    }) => {
      await startNewMeasure(page, { tableId: ORDERS_ID });
      await MeasureEditor.getAggregationPlaceholder(page).click();
      await popover(page).getByText("Average of ...", { exact: true }).click();
      await popover(page).getByText("Product", { exact: true }).click();
      await popover(page).getByText("Price", { exact: true }).click();
      await saveMeasure(page);

      await useMeasureInAdhocQuestion(page, { tableId: ORDERS_ID });
      await verifyScalarValue(page, "55.69");
    });

    test("should create a measure with a column from an implicit join using offset", async ({
      page,
    }) => {
      await startNewMeasure(page, { tableId: ORDERS_ID });
      await MeasureEditor.getAggregationPlaceholder(page).click();
      await popover(page).getByText("Custom Expression", { exact: true }).click();
      await typeCustomExpression(page, "Offset(Average([Product -> Price]), -1)");
      await customExpressionName(page).fill("Offset Measure");
      await popover(page).getByRole("button", { name: "Done", exact: true }).click();
      await saveMeasure(page);

      await useMeasureInAdhocQuestion(page, {
        tableId: ORDERS_ID,
        async customizeQuery() {
          await breakout(page, "Created At");
        },
      });
      await verifyRowValues(page, [["April 2025"], ["May 2025", "49.54"]]);
    });

    test("should create a measure with a custom aggregation expression", async ({
      page,
    }) => {
      await startNewMeasure(page, { tableId: ORDERS_ID });
      await MeasureEditor.getAggregationPlaceholder(page).click();
      await popover(page).getByText("Custom Expression", { exact: true }).click();
      await typeCustomExpression(
        page,
        "DistinctIf([Product → ID], [ID] > 1) + DistinctIf([ID], [Product → ID] > 1)",
      );
      await customExpressionName(page).fill("Custom");
      await popover(page).getByRole("button", { name: "Done", exact: true }).click();
      await saveMeasure(page);

      await useMeasureInAdhocQuestion(page, { tableId: ORDERS_ID });
      await verifyScalarValue(page, "18,867");
    });

    test("should create a measure based on a segment", async ({ page, mb }) => {
      await createSegment(mb.api, {
        name: "TotalSegment",
        definition: {
          "source-table": ORDERS_ID,
          filter: ["<", ["field", ORDERS.TOTAL, null], 100],
        },
      });

      await startNewMeasure(page, { tableId: ORDERS_ID });
      await MeasureEditor.getAggregationPlaceholder(page).click();
      await popover(page).getByText("Custom Expression", { exact: true }).click();
      await typeCustomExpression(page, "CountIf([TotalSegment])");
      await customExpressionName(page).fill("Custom");
      await popover(page).getByRole("button", { name: "Done", exact: true }).click();
      await saveMeasure(page);

      await useMeasureInAdhocQuestion(page, { tableId: ORDERS_ID });
      await verifyScalarValue(page, "13,005");
    });

    test("should create a measure based on another measure with an identity expression", async ({
      page,
      mb,
    }) => {
      await createMeasure(mb.api, {
        name: "TotalMeasure",
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
        },
      });

      await startNewMeasure(page, { tableId: ORDERS_ID });
      await MeasureEditor.getAggregationPlaceholder(page).click();
      await popover(page).getByText("Custom Expression", { exact: true }).click();
      await typeCustomExpression(page, "[TotalMeasure]");
      await customExpressionName(page).fill("Custom");
      await popover(page).getByRole("button", { name: "Done", exact: true }).click();
      await saveMeasure(page);

      await useMeasureInAdhocQuestion(page, { tableId: ORDERS_ID });
      await verifyScalarValue(page, "1,510,621.68");
    });

    test("should create a measure based on another measure", async ({
      page,
      mb,
    }) => {
      await createMeasure(mb.api, {
        name: "TotalMeasure",
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
        },
      });

      await startNewMeasure(page, { tableId: ORDERS_ID });
      await MeasureEditor.getAggregationPlaceholder(page).click();
      await popover(page).getByText("Custom Expression", { exact: true }).click();
      await typeCustomExpression(page, "floor([TotalMeasure])");
      await customExpressionName(page).fill("Custom");
      await popover(page).getByRole("button", { name: "Done", exact: true }).click();
      await saveMeasure(page);

      await useMeasureInAdhocQuestion(page, { tableId: ORDERS_ID });
      await verifyScalarValue(page, "1,510,621");
    });

    // Faithful duplicate of the earlier identity-expression test — upstream has
    // two `it`s with the same title; Playwright treats duplicate titles as a
    // hard load error, so the second is suffixed.
    test("should create a measure based on another measure with an identity expression (2)", async ({
      page,
      mb,
    }) => {
      await createMeasure(mb.api, {
        name: "TotalMeasure",
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
        },
      });

      await startNewMeasure(page, { tableId: ORDERS_ID });
      await MeasureEditor.getAggregationPlaceholder(page).click();
      await popover(page).getByText("Custom Expression", { exact: true }).click();
      await typeCustomExpression(page, "[TotalMeasure]");
      await customExpressionName(page).fill("Custom");
      await popover(page).getByRole("button", { name: "Done", exact: true }).click();
      await saveMeasure(page);

      await useMeasureInAdhocQuestion(page, { tableId: ORDERS_ID });
      await verifyScalarValue(page, "1,510,621.68");
    });

    test("should not be possible to create a measure that references itself", async ({
      page,
    }) => {
      await visitNewMeasurePage(page, ORDERS_ID);

      await MeasureEditor.getNameInput(page).fill(MEASURE_NAME);
      await MeasureEditor.getAggregationPlaceholder(page).click();
      await popover(page).getByText("Count of rows", { exact: true }).click();

      await MeasureEditor.getSaveButton(page).click();
      await expectUndoToast(page, "Measure created");

      await MeasureEditor.get(page).getByText("Count", { exact: true }).click();
      await popover(page).getByText("Custom Expression", { exact: true }).click();
      await clearCustomExpression(page);
      await typeCustomExpression(page, "[Table Measure]", { focus: false });
      await blurCustomExpression(page);

      await popover(page).getByRole("button", { name: "Update", exact: true }).click();
      await MeasureEditor.getSaveButton(page).click();

      await expectUndoToast(page, "Failed to update measure");
    });

    test("should not be possible to create a measure that references a metric", async ({
      page,
      mb,
    }) => {
      await createQuestion(mb.api, {
        name: "OrdersCount",
        type: "metric",
        description: "A metric",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
        },
      });

      await visitNewMeasurePage(page, ORDERS_ID);
      await MeasureEditor.getNameInput(page).fill(MEASURE_NAME);
      await MeasureEditor.getAggregationPlaceholder(page).click();

      await expect(
        popover(page).getByText("Metrics", { exact: true }),
      ).toHaveCount(0);
      await popover(page).getByText("Custom Expression", { exact: true }).click();

      await typeCustomExpression(page, "[OrdersCount]");
      await blurCustomExpression(page);
      await expect(
        popover(page).getByText(
          "Unknown Aggregation, Measure or Metric: OrdersCount",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        popover(page).getByRole("button", { name: "Done", exact: true }),
      ).toBeDisabled();
    });

    test("should be possible to create measures with filters like CountIf", async ({
      page,
    }) => {
      await startNewMeasure(page, { tableId: ORDERS_ID });
      await MeasureEditor.getAggregationPlaceholder(page).click();
      await popover(page).getByText("Custom Expression", { exact: true }).click();
      await typeCustomExpression(page, "CountIf([Total] > 10)");
      await customExpressionName(page).fill("Custom");
      await popover(page).getByRole("button", { name: "Done", exact: true }).click();
      await saveMeasure(page);

      await useMeasureInAdhocQuestion(page, { tableId: ORDERS_ID });
      await verifyScalarValue(page, "18,758");
    });

    test("should be possible to create measures with filters like CountIf based on segments", async ({
      page,
      mb,
    }) => {
      await createSegment(mb.api, {
        name: "LargeTotal",
        definition: {
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            "source-table": ORDERS_ID,
            filter: [">", ["field", ORDERS.TOTAL, null], 10],
          },
        },
      });

      await startNewMeasure(page, { tableId: ORDERS_ID });
      await MeasureEditor.getAggregationPlaceholder(page).click();
      await popover(page).getByText("Custom Expression", { exact: true }).click();
      await typeCustomExpression(page, "CountIf([LargeTotal])");
      await customExpressionName(page).fill("Custom");
      await popover(page).getByRole("button", { name: "Done", exact: true }).click();
      await saveMeasure(page);

      await useMeasureInAdhocQuestion(page, { tableId: ORDERS_ID });
      await verifyScalarValue(page, "18,758");
    });

    test("should be possible to create measures with filters like based on segments that are nested", async ({
      page,
      mb,
    }) => {
      const { id: segmentId } = await createSegment(mb.api, {
        name: "LargeTotal",
        definition: {
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            "source-table": ORDERS_ID,
            filter: [">", ["field", ORDERS.TOTAL, null], 10],
          },
        },
      });
      await createSegment(mb.api, {
        name: "NestedSegment",
        definition: {
          type: "query",
          database: SAMPLE_DB_ID,
          query: {
            "source-table": ORDERS_ID,
            filter: [
              "or",
              ["<", ["field", ORDERS.TOTAL, null], 5],
              ["segment", segmentId],
            ],
          },
        },
      });

      await startNewMeasure(page, { tableId: ORDERS_ID });
      await MeasureEditor.getAggregationPlaceholder(page).click();
      await popover(page).getByText("Custom Expression", { exact: true }).click();
      await typeCustomExpression(page, "CountIf([NestedSegment])");
      await customExpressionName(page).fill("Custom");
      await popover(page).getByRole("button", { name: "Done", exact: true }).click();
      await saveMeasure(page);

      await useMeasureInAdhocQuestion(page, { tableId: ORDERS_ID });
      await verifyScalarValue(page, "18,759");
    });

    test("should be possible to offset a measure in a query", async ({
      page,
      mb,
    }) => {
      await createMeasure(mb.api, {
        name: MEASURE_NAME,
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
        },
      });

      await useMeasureInAdhocQuestion(page, {
        tableId: ORDERS_ID,
        async customizeQuery() {
          await getNotebookStep(page, "summarize")
            .getByText("Table Measure", { exact: true })
            .click();
          await clearCustomExpression(page);
          await typeCustomExpression(page, `Offset([${MEASURE_NAME}], -1)`, {
            focus: false,
          });
          await popover(page).getByRole("button", { name: "Update", exact: true }).click();

          await breakout(page, "Created At");
        },
      });

      await verifyRowValues(page, [["April 2025"], ["May 2025", "52.76"]]);
    });
  });

  test("should be possible to order by an aggregation using a measure directly", async ({
    page,
    mb,
  }) => {
    await createMeasure(mb.api, {
      name: MEASURE_NAME,
      definition: {
        "source-table": ORDERS_ID,
        aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
      },
    });

    await useMeasureInAdhocQuestion(page, {
      tableId: ORDERS_ID,
      async customizeQuery() {
        await breakout(page, "Created At");

        await page.getByRole("button", { name: "Sort", exact: true }).click();
        await popover(page).getByText("Table Measure", { exact: true }).click();
        await getNotebookStep(page, "sort")
          .getByText("Table Measure", { exact: true })
          .click();
      },
    });

    await verifyRowValues(page, [
      ["January 2029", "52,249.59"],
      ["January 2028", "51,634.16"],
    ]);
  });

  test("should be possible to order by an aggregation using a custom expression based on a measure", async ({
    page,
    mb,
  }) => {
    await createMeasure(mb.api, {
      name: MEASURE_NAME,
      definition: {
        "source-table": ORDERS_ID,
        aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
      },
    });

    await useMeasureInAdhocQuestion(page, {
      tableId: ORDERS_ID,
      async customizeQuery() {
        await getNotebookStep(page, "summarize")
          .getByText("Table Measure", { exact: true })
          .click();
        // Use weird formula to get different ordering in results
        await clearCustomExpression(page);
        await typeCustomExpression(
          page,
          `length(text(log([${MEASURE_NAME}])))`,
          { focus: false },
        );
        await popover(page).getByRole("button", { name: "Update", exact: true }).click();

        await breakout(page, "Created At");

        await page.getByRole("button", { name: "Sort", exact: true }).click();
        await popover(page).getByText("Table Measure", { exact: true }).click();
      },
    });

    await verifyRowValues(page, [
      ["August 2026", "16"],
      ["April 2029", "16"],
      ["May 2025", "17"],
    ]);
  });

  test.describe("follow up stages", () => {
    test("should be possible to use results of a measure in follow up stages", async ({
      page,
      mb,
    }) => {
      await createMeasure(mb.api, {
        name: MEASURE_NAME,
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
        },
      });

      await useMeasureInAdhocQuestion(page, {
        tableId: ORDERS_ID,
        async customizeQuery() {
          await breakout(page, "Created At");

          await getNotebookStep(page, "summarize")
            .getByRole("button", { name: "Filter", exact: true })
            .click();
          await popover(page).getByText(MEASURE_NAME, { exact: true }).click();
          await popover(page).getByPlaceholder("Min").fill("100");
          await popover(page)
            .getByRole("button", { name: "Add filter", exact: true })
            .click();

          await getNotebookStep(page, "summarize")
            .getByRole("button", { name: "Custom column", exact: true })
            .click();
          await enterCustomColumnDetails(page, {
            formula: `floor([${MEASURE_NAME}] * 2)`,
            name: "Double measure",
          });
          await popover(page)
            .getByRole("button", { name: "Done", exact: true })
            .click();

          await getNotebookStep(page, "filter", { stage: 1 })
            .getByText("Summarize", { exact: true })
            .click();
          await popover(page)
            .getByText("Minimum of ...", { exact: true })
            .click();
          await popover(page).getByText("Double measure", { exact: true }).click();
        },
      });
      await verifyScalarValue(page, "2,531");
    });

    test("should be possible to join on a measure in a follow up stage", async ({
      page,
      mb,
    }) => {
      await createMeasure(mb.api, {
        name: MEASURE_NAME,
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
        },
      });

      await useMeasureInAdhocQuestion(page, {
        tableId: ORDERS_ID,
        async customizeQuery() {
          await breakout(page, "Created At");

          await getNotebookStep(page, "summarize")
            .getByRole("button", { name: "Join data", exact: true })
            .click();
          await popover(page).getByText("Sample Database", { exact: true }).click();
          await popover(page).getByText("Orders", { exact: true }).click();

          await popover(page).getByText("Table Measure", { exact: true }).click();
          await popover(page).getByText("Total", { exact: true }).click();
        },
      });

      await verifyRowValues(page, [["April 2025", "52.76", "8685"]]);
    });
  });

  test("should be possible to join on a measure in a follow up stage with a custom expression", async ({
    page,
    mb,
  }) => {
    await createMeasure(mb.api, {
      name: MEASURE_NAME,
      definition: {
        "source-table": ORDERS_ID,
        aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
      },
    });
    await useMeasureInAdhocQuestion(page, {
      tableId: ORDERS_ID,
      async customizeQuery() {
        await breakout(page, "Created At");

        await getNotebookStep(page, "summarize")
          .getByRole("button", { name: "Join data", exact: true })
          .click();
        await popover(page).getByText("Sample Database", { exact: true }).click();
        await popover(page).getByText("Orders", { exact: true }).click();

        await popover(page).getByText("Custom Expression", { exact: true }).click();

        await clearCustomExpression(page);
        await typeCustomExpression(page, "floor([Table Measure]/10)", {
          focus: false,
        });
        await blurCustomExpression(page);
        await popover(page).getByText("Done", { exact: true }).click();

        await popover(page).getByText("ID", { exact: true }).click();
      },
    });

    await verifyRowValues(page, [["April 2025", "52.76", "5", "1"]]);
  });

  test.describe("measure refs", () => {
    test("should be possible to rename a measure without breaking queries that reference it", async ({
      page,
      mb,
    }) => {
      const { id: measureId } = await createMeasure(mb.api, {
        name: MEASURE_NAME,
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
        },
      });

      await useMeasureInAdhocQuestion(page, { tableId: ORDERS_ID });

      await updateMeasure(mb.api, {
        id: measureId,
        name: "Renamed measure",
      });

      await page.reload();
      await verifyScalarValue(page, "1,510,621.68");
    });

    test("should be possible to rename an aggregation expression based on a measure without breaking it", async ({
      page,
      mb,
    }) => {
      await createMeasure(mb.api, {
        name: MEASURE_NAME,
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
        },
      });

      await useMeasureInAdhocQuestion(page, {
        tableId: ORDERS_ID,
        async customizeQuery() {
          await getNotebookStep(page, "summarize")
            .getByText("Table Measure", { exact: true })
            .click();
          await customExpressionName(page).fill("Renamed aggregation");
          await popover(page)
            .getByRole("button", { name: "Update", exact: true })
            .click();
        },
      });

      await verifyScalarValue(page, "1,510,621.68");
    });

    test("changing the top-level aggregation expression in a measure might break queries that reference it in follow up stages", async ({
      page,
      mb,
    }) => {
      const { id: measureId } = await createMeasure(mb.api, {
        name: MEASURE_NAME,
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
        },
      });
      const question = await createQuestion(mb.api, {
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["measure", { "display-name": MEASURE_NAME }, measureId]],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "day" }]],
        },
      });

      // Add a second stage that references the measure
      await visitQuestion(page, question.id);
      await openNotebook(page);
      await getNotebookStep(page, "summarize")
        .getByText("Filter", { exact: true })
        .click();
      await popover(page).getByText(MEASURE_NAME, { exact: true }).click();
      await popover(page).getByPlaceholder("Min").fill("10");
      await popover(page)
        .getByRole("button", { name: "Add filter", exact: true })
        .click();

      const savedCard = page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          new URL(response.url()).pathname === `/api/card/${question.id}`,
      );
      await queryBuilderHeader(page)
        .getByRole("button", { name: "Save", exact: true })
        .click();
      // Ensure that 'Replace original question' is checked
      await expect(
        modal(page).getByLabel(/Replace original question/i),
      ).toBeChecked();
      await modal(page).getByRole("button", { name: "Save", exact: true }).click();
      await savedCard;
      await expect(modal(page)).toHaveCount(0);

      await updateMeasure(mb.api, {
        id: measureId,
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
        },
      });

      // Add a second stage that references the measure
      await page.goto(`/question/${question.id}`);
      await expect(
        page
          .getByTestId("query-builder-main")
          .getByText("There was a problem with your question", { exact: true }),
      ).toBeVisible();
    });
  });

  test("should be possible to use a measure in a pivot table", async ({
    page,
    mb,
  }) => {
    const { id: measureId } = await createMeasure(mb.api, {
      name: MEASURE_NAME,
      definition: {
        "source-table": ORDERS_ID,
        aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
      },
    });
    const question = await createQuestion(mb.api, {
      name: "Question with measure",
      display: "pivot",
      visualization_settings: {
        "table.pivot_column": "Created At: Week",
        "table.cell_column": "Table Measure",
      },
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["measure", { "display-name": MEASURE_NAME }, measureId]],
        breakout: [
          ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
          [
            "field",
            PRODUCTS.CATEGORY,
            { "base-type": "type/Text", "source-field": ORDERS.PRODUCT_ID },
          ],
        ],
      },
    });
    await visitQuestion(page, question.id);

    const pivot = page.getByTestId("pivot-table");
    await expect(pivot.getByText("Row totals", { exact: true })).toBeVisible();
    await expect(pivot.getByText("Grand totals", { exact: true })).toBeVisible();
    const cells = pivot.getByTestId("pivot-table-cell");
    await expect(cells).toHaveCount(42);
    // a random cell
    await expect(cells.nth(12)).toHaveText("9,031.56");
  });

  test.describe("using measures in saved questions", () => {
    test("should be possible to use measure results in a saved question as source for a follow up question", async ({
      page,
      mb,
    }) => {
      const { id: measureId } = await createMeasure(mb.api, {
        name: MEASURE_NAME,
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
        },
      });
      const question = await createQuestion(mb.api, {
        name: "Question with measure",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["measure", { "display-name": MEASURE_NAME }, measureId]],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "week" }]],
        },
      });
      const followUp = await createQuestion(mb.api, {
        query: {
          "source-table": `card__${question.id}`,
        },
        display: "scalar",
      });
      await visitQuestion(page, followUp.id);

      await openNotebook(page);

      await filterInNotebook(page);
      await popover(page).getByText(MEASURE_NAME, { exact: true }).click();
      await popover(page).getByPlaceholder("Min").fill("100");
      await popover(page)
        .getByRole("button", { name: "Add filter", exact: true })
        .click();

      await summarize(page, { mode: "notebook" });
      await popover(page).getByText("Custom Expression", { exact: true }).click();
      await enterCustomColumnDetails(page, {
        formula: `Sum([${MEASURE_NAME}])`,
        name: "Table Measure Sum",
      });
      await popover(page).getByRole("button", { name: "Done", exact: true }).click();

      await visualize(page);
      await verifyScalarValue(page, "1,510,568.93");
    });

    test("should be possible to use measure results in a saved question as source for a follow up model", async ({
      page,
      mb,
    }) => {
      const { id: measureId } = await createMeasure(mb.api, {
        name: MEASURE_NAME,
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
        },
      });
      const question = await createQuestion(mb.api, {
        name: "Question with measure",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["measure", { "display-name": MEASURE_NAME }, measureId]],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "week" }]],
        },
      });
      const model = await createQuestion(mb.api, {
        type: "model",
        query: {
          "source-table": `card__${question.id}`,
        },
        display: "scalar",
      });
      // A model with data access runs its query ad-hoc via POST /api/dataset
      // (not /api/card/:id/query), so the strict visitQuestion helper hangs —
      // wait on /api/dataset, mirroring H.visitModel's default wait.
      const modelQuery = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/dataset",
      );
      await page.goto(`/question/${model.id}`);
      await modelQuery;

      await openQuestionActions(page, "Edit query definition");

      await filterInNotebook(page);
      await popover(page).getByText(MEASURE_NAME, { exact: true }).click();
      await popover(page).getByPlaceholder("Min").fill("100");
      await popover(page)
        .getByRole("button", { name: "Add filter", exact: true })
        .click();

      await summarize(page, { mode: "notebook" });
      await popover(page).getByText("Custom Expression", { exact: true }).click();
      await enterCustomColumnDetails(page, {
        formula: `Sum([${MEASURE_NAME}])`,
        name: "Table Measure Sum",
      });
      await popover(page).getByRole("button", { name: "Done", exact: true }).click();

      await page
        .getByTestId("dataset-edit-bar")
        .getByRole("button", { name: "Save changes", exact: true })
        .click();
      await verifyScalarValue(page, "1,510,568.93");
    });

    test("should be possible x-ray a question containing a measure", async ({
      page,
      mb,
    }) => {
      const { id: measureId } = await createMeasure(mb.api, {
        name: MEASURE_NAME,
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
        },
      });
      const model = await createQuestion(mb.api, {
        name: "Test model",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["measure", { "display-name": MEASURE_NAME }, measureId]],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "day" }]],
        },
      });

      await page.goto(`/auto/dashboard/question/${model.id}`);

      await expect(
        main(page).getByText("A look at the Table Measure", { exact: true }),
      ).toBeVisible();
    });
  });

  test.describe("using measures in models", () => {
    test("should be possible x-ray a model containing a measure", async ({
      page,
      mb,
    }) => {
      const { id: measureId } = await createMeasure(mb.api, {
        name: MEASURE_NAME,
        definition: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
        },
      });
      const model = await createQuestion(mb.api, {
        type: "model",
        name: "Test model",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["measure", { "display-name": MEASURE_NAME }, measureId]],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "day" }]],
        },
      });

      await page.goto(`/auto/dashboard/model/${model.id}`);

      await expect(
        main(page).getByText("A look at the Table Measure", { exact: true }),
      ).toBeVisible();
    });
  });
});
