/**
 * Playwright port of
 * e2e/test/scenarios/visualizations-charts/visualizations-charts-reproductions.cy.spec.ts
 *
 * No gating tags upstream. One test (issue 55853) is @external-by-construction:
 * it restores the postgres-12 snapshot and creates a card against the writable
 * QA Postgres DB, so it is gated on PW_QA_DB_ENABLED per the playbook.
 *
 * Notes on faithfulness:
 * - `cy.trigger("mousemove")` on a chart circle is ported as `.hover()` (real
 *   mouse move to the element center — same as the Cypress default) since the
 *   ECharts tooltip is driven by zrender's global mousemove handler.
 * - `H.visitQuestionAdhoc` on a NATIVE query autoruns the query in Cypress
 *   (runQueryIfNeeded); the spike's permissions.visitQuestionAdhoc refuses
 *   native autorun, so those cases use charts-extras.visitNativeQuestionAdhoc
 *   (visit + runNativeQuery), which is the faithful equivalent.
 */
import { chartPathWithFillColor } from "../support/binning";
import { echartsContainer, leftSidebar, openVizSettingsSidebar } from "../support/charts";
import { getDraggableElements } from "../support/charts-extras";
import { openPinnedItemMenu, getPinnedSection } from "../support/collections";
import { editDashboard, sidebar } from "../support/dashboard";
import {
  saveDashcardVisualizerModal,
  showDashcardVisualizerModalSettings,
} from "../support/dashboard-card-repros";
import {
  addToDocument,
  commandSuggestionItem,
  documentContent,
  getDocumentCard,
  getDocumentSidebar,
  openDocumentCardMenu,
  removeSummaryGroupingField,
} from "../support/documents-core";
import { test, expect } from "../support/fixtures";
import { selectFilterOperator } from "../support/joins";
import { runNativeQueryEitherEndpoint } from "../support/native-filters-extras";
import {
  getNotebookStep,
  openNotebook,
  tableHeaderClick,
  visualize,
} from "../support/notebook";
import { visitCollection } from "../support/question-new";
import { openCollectionItemMenu } from "../support/bookmarks-extras";
import { WRITABLE_DB_ID } from "../support/schema-viewer";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { saveQuestion } from "../support/sharing";
import { icon, modal, popover, visitDashboard, visitQuestion } from "../support/ui";
import { createNativeVizQuestion } from "../support/viz-tabular-repros";
import {
  addQuestionToDashboard,
  assertDataVisible,
  assertEChartsTooltip,
  assertNoPoints,
  cartesianChartCircleWithColor,
  chartGridLines,
  getChartPoints,
  getNoPointsMessage,
  moveDnDKitElementVertically,
  openObjectDetail,
  saveSavedQuestion,
  visitAdhoc,
  visitNativeAdhoc,
  vizSettingsSidebar,
} from "../support/viz-charts-repros";

const { PRODUCTS, PRODUCTS_ID, ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

test.describe("issue 43075", () => {
  const questionDetails = {
    query: {
      "source-table": PRODUCTS_ID,
      aggregation: [["count"]],
      breakout: [["field", PRODUCTS.CATEGORY, null]],
    },
  };

  test.beforeEach(async ({ page, mb }) => {
    await page.setViewportSize({ width: 1000, height: 300 });
    await mb.restore();
    await mb.signInAsAdmin();
    const { id } = await mb.api.createQuestion(questionDetails);
    await visitQuestion(page, id);
  });

  test("the breakout popover should fit within the window (metabase#43075)", async ({
    page,
  }) => {
    await page
      .getByTestId("cell-data")
      .filter({ hasText: "54" })
      .first()
      .click();
    await popover(page).getByText("Break out by…", { exact: true }).click();
    await popover(page).getByText("Category", { exact: true }).click();

    const { scrollHeight, offsetHeight } = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      offsetHeight: document.documentElement.offsetHeight,
    }));
    expect(scrollHeight).toBeLessThanOrEqual(offsetHeight);
  });
});

test.describe("issue 41133", () => {
  const questionDetails = {
    query: {
      "source-table": PRODUCTS_ID,
    },
  };

  test.beforeEach(async ({ page, mb }) => {
    await page.setViewportSize({ width: 600, height: 400 });
    await mb.restore();
    await mb.signInAsAdmin();
    const { id } = await mb.api.createQuestion(questionDetails);
    await visitQuestion(page, id);
  });

  test("object detail view should be scrollable on narrow screens (metabase#41133)", async ({
    page,
  }) => {
    await openObjectDetail(page, 0);

    const dialog = modal(page);
    const createdAt = dialog.getByText("Created At", { exact: true });
    await createdAt.scrollIntoViewIfNeeded();
    await expect(createdAt).toBeVisible();
    // "is connected to:" is a bare text node sharing its <Text> with a bold
    // <span> (the row name), so testing-library's exact findByText matched the
    // direct text node while Playwright's exact getByText compares the full
    // element text — port as a case-sensitive substring regex (mixed-content).
    const connectedTo = dialog.getByText(/is connected to:/);
    await connectedTo.scrollIntoViewIfNeeded();
    await expect(connectedTo).toBeVisible();
  });
});

test.describe("issue 45255", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await visitNativeAdhoc(page, {
      dataset_query: {
        type: "native",
        native: {
          query:
            "select 'foo' step, 10 v union all select 'baz', 8 union all select null, 6 union all select 'bar', 4",
          "template-tags": {},
        },
        database: SAMPLE_DB_ID,
      },
      display: "funnel",
    });
  });

  test("should work on native queries with null dimension values (metabase#45255)", async ({
    page,
  }) => {
    await openVizSettingsSidebar(page);

    // Has (empty) in the settings sidebar
    await expect(sidebar(page).getByText("(empty)")).toBeVisible();

    // Can reorder (empty)
    await expect(getDraggableElements(page).nth(2)).toHaveText("(empty)");
    const dragElement = getDraggableElements(page).first();
    // Port of H.moveDnDKitElementByAlias(..., { vertical: 100, useMouseEvents:
    // true }) — the synthetic MouseEvent sequence matching that helper.
    await moveDnDKitElementVertically(dragElement, 100);
    await expect(getDraggableElements(page).nth(1)).toHaveText("(empty)");

    // Has (empty) in the chart
    await expect(
      page.getByTestId("funnel-chart").getByText("(empty)"),
    ).toBeVisible();
  });
});

test.describe("issue 49874, 48847", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("when two axis should show only one related to the hovered series", async ({
    page,
  }) => {
    await visitAdhoc(page, {
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            ["sum", ["field", ORDERS.QUANTITY, null]],
            ["sum", ["field", ORDERS.TOTAL, null]],
          ],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
        },
        database: 1,
      },
      display: "bar",
    });

    await expect(
      echartsContainer(page).getByText("Sum of Quantity"),
    ).toBeVisible();
    await expect(echartsContainer(page).getByText("Sum of Total")).toBeVisible();

    await expect(chartGridLines(page).first()).toBeAttached();

    await chartPathWithFillColor(page, "#88BF4D").first().hover();

    await expect(
      echartsContainer(page).getByText("Sum of Quantity"),
    ).toBeVisible();
    await expect(echartsContainer(page).getByText("Sum of Total")).toHaveCount(
      0,
    );
    await expect(chartGridLines(page).first()).toBeAttached();

    await chartPathWithFillColor(page, "#98D9D9").first().hover();

    await expect(
      echartsContainer(page).getByText("Sum of Quantity"),
    ).toHaveCount(0);
    await expect(echartsContainer(page).getByText("Sum of Total")).toBeVisible();
    await expect(chartGridLines(page).first()).toBeAttached();
  });
});

test.describe("issue 49529", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should allow selecting breakout dimension before metrics", async ({
    page,
  }) => {
    await visitAdhoc(page, {
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
        },
        database: 1,
      },
      display: "bar",
    });

    await openVizSettingsSidebar(page);

    await page.getByTestId("chart-setting-select").nth(0).click();
    await popover(page).getByText("ID", { exact: true }).click();

    await leftSidebar(page)
      .getByText("Add series breakout", { exact: true })
      .click();
    await popover(page).getByText("Quantity", { exact: true }).click();

    await expect(leftSidebar(page).getByText("Y-axis")).toBeVisible();
    await expect(leftSidebar(page).getByText("Nothing to order")).toBeVisible();
  });
});

test.describe("issue 47847", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should show chart tooltip on narrow ordinal line charts", async ({
    page,
  }) => {
    await visitAdhoc(page, {
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "week" }]],
        },
        database: SAMPLE_DB_ID,
      },
      display: "line",
      visualization_settings: {
        "graph.x_axis.scale": "ordinal",
        "graph.show_values": true,
      },
    });

    await cartesianChartCircleWithColor(page, "#509EE3").nth(0).hover();
    await assertEChartsTooltip(page, {
      header: "April 27 – May 3, 2025", // expect this to break when we shift years in the Sample Database
      blurAfter: false,
      footer: undefined,
      rows: [
        {
          color: "#509EE3",
          name: "Count",
          value: "1",
        },
      ],
    });
  });
});

test.describe("issue 51952", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should allow changing column settings for the x-axis column", async ({
    page,
  }) => {
    await visitAdhoc(page, {
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
        },
        database: SAMPLE_DB_ID,
      },
      display: "line",
      visualization_settings: {},
    });

    await openVizSettingsSidebar(page);

    await page.getByTestId("settings-CREATED_AT").click();
    await popover(page)
      .getByText("Abbreviate days and months", { exact: true })
      .click();
    await expect(echartsContainer(page).getByText("Jan 2027")).toBeVisible();
  });
});

test.describe("issue 55880", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should render scatter plot with native query data", async ({
    page,
  }) => {
    await visitNativeAdhoc(page, {
      visualization_settings: {
        "graph.dimensions": ["X"],
        "graph.metrics": ["Y"],
      },
      dataset_query: {
        type: "native",
        native: {
          query: `select * from (
  select 1415 x, 1 y
  union all select 20, 2
  union all select 900, 3
  union all select 115, 4
) as subquery
where x < {{param}}`,
          "template-tags": {
            param: {
              type: "number",
              name: "param",
              id: "144103a1-ebd4-4477-a7fa-f08cfd808d5e",
              "display-name": "Param",
              required: true,
              default: "30",
            },
          },
        },
        database: SAMPLE_DB_ID,
      },
      display: "scatter",
    });

    // Renders a scatter chart with numeric x-axis
    await expect(chartPathWithFillColor(page, "#88BF4D")).toHaveCount(1);
    await expect(echartsContainer(page).getByText("20")).toBeVisible();

    await saveQuestion(page, "55880");

    // Change filter value so values include numbers that can be parsed as valid dates
    await page.getByPlaceholder("Param", { exact: true }).fill("1500");
    await runNativeQueryEitherEndpoint(page);

    // Still renders a scatter chart with numeric x-axis
    await expect(echartsContainer(page).getByText("1,500")).toBeVisible();
    await expect(chartPathWithFillColor(page, "#88BF4D")).toHaveCount(4);
  });
});

test.describe("issue 47757", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should show correct tooltips for interpolated data points (metabase#47757)", async ({
    page,
  }) => {
    await visitNativeAdhoc(page, {
      visualization_settings: {
        "graph.dimensions": ["X"],
        "graph.metrics": ["Y"],
        series_settings: { Y: { "line.missing": "zero" } },
      },
      dataset_query: {
        type: "native",
        native: {
          query: `select '2020-01-01' x, 10 y
union all select '2020-03-01' x, 30 y
union all select '2020-04-01' x, 40 y`,
          "template-tags": {},
        },
        database: SAMPLE_DB_ID,
      },
      display: "line",
    });

    await cartesianChartCircleWithColor(page, "#88BF4D").nth(0).hover();
    await assertEChartsTooltip(page, {
      header: "January 2020",
      rows: [
        {
          color: "#88BF4D",
          name: "Y",
          value: 10,
        },
      ],
      footer: undefined,
      blurAfter: true,
    });

    await cartesianChartCircleWithColor(page, "#88BF4D").nth(1).hover();
    await assertEChartsTooltip(page, {
      header: "February 2020",
      rows: [
        {
          color: "#88BF4D",
          name: "Y",
          value: 0,
          secondaryValue: "-100%",
        },
      ],
      footer: undefined,
      blurAfter: true,
    });

    await cartesianChartCircleWithColor(page, "#88BF4D").nth(2).hover();
    await assertEChartsTooltip(page, {
      header: "March 2020",
      rows: [
        {
          color: "#88BF4D",
          name: "Y",
          value: 30,
          secondaryValue: "+∞%",
        },
      ],
      footer: undefined,
      blurAfter: true,
    });
  });
});

test.describe("issue 59671", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not crash when removing dimension aggregation column from the query (metabase#59671)", async ({
    page,
    mb,
  }) => {
    const questionDetails = {
      display: "line",
      query: {
        "source-table": ORDERS_ID,
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
        aggregation: [["count"]],
      },
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["count"],
      },
    };

    const { id } = await mb.api.createQuestion(questionDetails);
    await visitQuestion(page, id);
    await openNotebook(page);
    await removeSummaryGroupingField(page, { field: "Created At: Month" });
    await visualize(page);
  });
});

test.describe("issue 59830", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not crash when saved dimension settings refer to a non-existent column (metabase#59830)", async ({
    page,
    mb,
  }) => {
    const questionDetails = {
      display: "line",
      query: {
        "source-table": ORDERS_ID,
        breakout: [
          ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
        ],
        aggregation: [["count"], ["avg", ["field", ORDERS.TOTAL, null]]],
      },
      visualization_settings: {
        "graph.dimensions": ["DOES_NOT_EXIST"],
        "graph.metrics": ["count"],
      },
    };

    const { id } = await mb.api.createQuestion(questionDetails);
    await visitQuestion(page, id);
    await expect(icon(page, "warning")).toHaveCount(0);
    await expect(page.getByTestId("chart-container")).toBeVisible();
  });
});

test.describe("issue 54755", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should show an empty state when no dimensions are available (metabase#54755)", async ({
    page,
    mb,
  }) => {
    const questionDetails = {
      display: "line",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
      },
      visualization_settings: {
        "graph.dimensions": [],
        "graph.metrics": ["count"],
      },
    };

    const { id } = await mb.api.createQuestion(questionDetails);
    await visitQuestion(page, id);
    await expect(icon(page, "warning")).toHaveCount(0);
    await expect(
      page.getByTestId("visualization-placeholder"),
    ).toBeVisible();
  });
});

test.describe("issue 63026", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should show tooltips with reasonable width for pie charts with long text labels (metabase#63026)", async ({
    page,
  }) => {
    const query = `select '${"a".repeat(1000)}' as category, 45 as count
union all select 'Short name', 25 as count
union all select 'Medium length category', 30 as count`;

    await visitNativeAdhoc(page, {
      display: "pie",
      dataset_query: {
        type: "native",
        native: {
          query,
          "template-tags": {},
        },
        database: SAMPLE_DB_ID,
      },
      visualization_settings: {
        "pie.show_labels": true,
      },
    });

    // The pie slice's data label <text> sits on top of the wedge path in the
    // DOM and intercepts pointer events; Cypress's synthetic trigger("mousemove")
    // ignores that. Force the hover — zrender hit-tests by coordinate, not DOM
    // topmost, so the wedge tooltip still opens.
    await chartPathWithFillColor(page, "#88BF4D").hover({ force: true });

    const tooltip = page.getByTestId("echarts-tooltip").filter({
      visible: true,
    });
    await expect(tooltip).toBeVisible();
    const width = await tooltip.evaluate(
      (el) => (el as HTMLElement).getBoundingClientRect().width,
    );
    expect(width).toBeLessThanOrEqual(550);
  });
});

test.describe("issue 55853", () => {
  const questionDetails = {
    name: "55853",
    database: WRITABLE_DB_ID,
    native: {
      query: `select 'Category A' as category, 0.0001 as value union all
        select 'Category B' as category, 0.0002 as value union all
        select 'Category C' as category, 0.00015 as value union all
        select 'Category D' as category, 0.00025 as value`,
      "template-tags": {},
    },
    display: "bar",
    visualization_settings: {
      "graph.dimensions": ["category"],
      "graph.metrics": ["value"],
      column_settings: {
        '["name","value"]': {
          number_style: "percent",
        },
      },
    },
  };

  test.skip(
    !process.env.PW_QA_DB_ENABLED,
    "@external — requires the writable QA Postgres database and its postgres-12 snapshot (set PW_QA_DB_ENABLED)",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore("postgres-12");
    await mb.signInAsAdmin();
  });

  test("should not have y-axis labels colliding with very low percentages (metabase#55853)", async ({
    page,
    mb,
  }) => {
    const { id } = await createNativeVizQuestion(mb.api, questionDetails);
    await visitQuestion(page, id);

    // Verify that the chart renders successfully
    await expect(echartsContainer(page)).toBeVisible();
    await expect(echartsContainer(page).locator("text").filter({ hasText: "%" }).first()).toBeVisible();
    await expect(chartPathWithFillColor(page, "#88BF4D")).toHaveCount(4);

    // Check that axis labels and title don't overlap
    const overlap = await echartsContainer(page)
      .locator("text")
      .evaluateAll((texts) => {
        const percentTexts: { text: string; rect: DOMRect }[] = [];
        const axisTitle: { text: string; rect: DOMRect }[] = [];
        for (const el of texts) {
          const text = (el.textContent ?? "").trim();
          if (text.includes("%") && text !== "value") {
            percentTexts.push({ text, rect: el.getBoundingClientRect() });
          }
          if (text === "value") {
            axisTitle.push({ text, rect: el.getBoundingClientRect() });
          }
        }
        const violations: string[] = [];
        if (axisTitle.length > 0 && percentTexts.length > 0) {
          const titleRect = axisTitle[0].rect;
          for (const { text, rect } of percentTexts) {
            if (rect.left - titleRect.right <= 5) {
              violations.push(text);
            }
          }
        }
        return { percentCount: percentTexts.length, violations };
      });

    // Verify we have percentage labels
    expect(overlap.percentCount).toBeGreaterThan(0);
    // Check that axis labels and title don't overlap
    expect(overlap.violations).toEqual([]);

    // Verify tooltips show correct percentage values (not incorrectly rounded)
    await chartPathWithFillColor(page, "#88BF4D").first().hover();
    await assertEChartsTooltip(page, {
      header: "Category A",
      rows: [
        {
          name: "value",
          value: "0.01%",
        },
      ],
    });
  });
});

test.describe("issue 10493", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should display bar chart for binned column distribution after applying filter (metabase#10493)", async ({
    page,
  }) => {
    await visitAdhoc(page, {
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
        },
        database: SAMPLE_DB_ID,
      },
    });

    // Click on Quantity column header and select Distribution
    await tableHeaderClick(page, "Quantity");
    await popover(page).getByText("Distribution", { exact: true }).click();

    // Verify bar chart is displayed with binned quantity as dimension
    await expect(page.getByTestId("visualization-root")).toHaveAttribute(
      "data-viz-ui-name",
      "Bar",
    );
    await expect(echartsContainer(page)).toBeVisible();
    await expect(chartPathWithFillColor(page, "#509EE3").first()).toBeAttached();

    // Apply filter: count >= 20
    const datasetResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/dataset",
    );
    await page
      .getByTestId("qb-header-action-panel")
      .getByText("Filter", { exact: true })
      .click();
    await popover(page).getByText("Summaries", { exact: true }).click();
    await popover(page).getByText("Count", { exact: true }).click();
    await selectFilterOperator(page, "Greater than or equal to");
    await popover(page).getByPlaceholder("Enter a number").fill("20");
    await popover(page)
      .getByRole("button", { name: "Apply filter", exact: true })
      .click();

    await datasetResponse;

    // Verify bar chart is still displayed (binned column should still be
    // treated as dimension)
    await expect(
      page.getByTestId("query-builder-main").getByText(/^Doing science/),
    ).toHaveCount(0);
    await expect(
      page.getByTestId("visualization-placeholder"),
    ).toHaveCount(0);
    await expect(page.getByTestId("visualization-root")).toHaveAttribute(
      "data-viz-ui-name",
      "Bar",
    );
    await expect(echartsContainer(page)).toBeVisible();
    await expect(chartPathWithFillColor(page, "#509EE3").first()).toBeAttached();
  });
});

test.describe("UXW-2696", () => {
  const QUESTION_NAME = "Count of orders by month";

  const questionDetails = {
    name: QUESTION_NAME,
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
    },
    display: "line",
    visualization_settings: {
      "graph.y_axis.min": 700,
      "graph.y_axis.max": 1000,
      "graph.y_axis.auto_range": false,
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should show you a popover when all data points are outside the y-axis range in the notebook editor", async ({
    page,
    mb,
  }) => {
    const { id } = await mb.api.createQuestion(questionDetails);
    await visitQuestion(page, id);

    await assertNoPoints(page);

    // Check that message is displayed
    await expect(getNoPointsMessage(page)).toBeVisible();

    await openVizSettingsSidebar(page);

    await vizSettingsSidebar(page).getByText("Axes", { exact: true }).click();
    const min = vizSettingsSidebar(page).getByLabel("Min", { exact: true });
    await min.clear();
    await min.fill("70");
    await min.blur();

    await assertDataVisible(page);

    const min2 = vizSettingsSidebar(page).getByLabel("Min", { exact: true });
    await min2.clear();
    await min2.fill("700");
    await min2.blur();

    await assertNoPoints(page);

    await page
      .getByRole("switch", { name: /auto y-axis range/i })
      .click({ force: true });

    await assertDataVisible(page);
  });

  test("should show the message on pinned cards", async ({ page, mb }) => {
    await mb.api.createQuestion(questionDetails);

    await visitCollection(page, "root");
    await openCollectionItemMenu(page, QUESTION_NAME);
    await popover(page).getByText("Pin this", { exact: true }).click();

    await assertNoPoints(getPinnedSection(page));

    // assert that the menu trigger is not covered
    await openPinnedItemMenu(page, QUESTION_NAME);
    await expect(popover(page)).toBeVisible();
  });

  test("should show the message in documents", async ({ page, mb }) => {
    await mb.api.createQuestion(questionDetails);

    // setup a document
    await page.goto("/document/new");
    await documentContent(page).click();

    await addToDocument(page, "/ord", false);
    await commandSuggestionItem(page, new RegExp(QUESTION_NAME)).click();

    await assertNoPoints(getDocumentCard(page, QUESTION_NAME));

    await openDocumentCardMenu(page, QUESTION_NAME);
    await popover(page)
      .getByText("Edit Visualization", { exact: true })
      .click();

    const docSidebar = getDocumentSidebar(page);
    await docSidebar.getByRole("tab", { name: /axes/i }).click({ force: true });
    await expect(
      docSidebar.getByLabel("Auto y-axis range"),
    ).toHaveAttribute("data-checked", "false");

    const min = docSidebar.getByLabel("Min", { exact: true });
    await min.clear();
    await min.fill("70");

    await assertDataVisible(getDocumentCard(page, QUESTION_NAME));
  });

  test.describe("dashcard", () => {
    test("should show you a message on a dashboard", async ({ page, mb }) => {
      const { id: cardId } = await mb.api.createQuestion(questionDetails);
      const { id: dashboardId } = await mb.api.createDashboard({
        name: "Test Dashboard",
      });
      await addQuestionToDashboard(mb.api, { dashboardId, cardId });

      await visitDashboard(page, mb.api, dashboardId);

      await assertNoPoints(page.getByTestId("dashcard"));

      await editDashboard(page);
      await showDashcardVisualizerModalSettings(page, 0, {
        isVisualizerCard: false,
      });

      const dialog = modal(page);
      await dialog.getByRole("tab", { name: /axes/i }).click({ force: true });
      await expect(
        dialog.getByLabel("Auto y-axis range"),
      ).toHaveAttribute("data-checked", "false");

      await assertNoPoints(dialog, false);
      await expect(getNoPointsMessage(dialog)).toHaveCount(0);

      const min = dialog.getByLabel("Min", { exact: true });
      await min.clear();
      await min.fill("70");
      await min.blur();

      await assertDataVisible(dialog);

      await saveDashcardVisualizerModal(page);

      await page
        .getByTestId("edit-bar")
        .getByRole("button", { name: "Save", exact: true })
        .click();

      await expect(page.getByTestId("edit-bar")).toHaveCount(0);

      await expect(
        getChartPoints(page.getByTestId("dashcard")).first(),
      ).toBeVisible();
    });
  });
});

test.describe("issue 69882", () => {
  const DOOHICKEY_BAR_COLOR = "#227FD2";
  const GADGET_LINE_COLOR = "#689636";

  const questionDetails = {
    name: "69882",
    display: "combo",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [
        ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
        ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
      ],
    },
    visualization_settings: {
      series_settings: {
        Doohickey: {
          color: DOOHICKEY_BAR_COLOR,
          title: "_Doohickey",
          display: "bar",
        },
        Gadget: {
          color: GADGET_LINE_COLOR,
          title: "_Gadget",
          display: "line",
        },
      },
      "graph.x_axis.scale": "timeseries",
      "graph.dimensions": ["CREATED_AT", "CATEGORY"],
      "graph.metrics": ["count"],
    },
  };

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should apply per-series display type on a question and dashcard (metabase#69882)", async ({
    page,
    mb,
  }) => {
    const { id: cardId } = await mb.api.createQuestion(questionDetails);
    await visitQuestion(page, cardId);

    await expect(echartsContainer(page)).toBeVisible();
    await expect(
      chartPathWithFillColor(page, DOOHICKEY_BAR_COLOR).first(),
    ).toBeAttached();
    await expect(
      cartesianChartCircleWithColor(page, GADGET_LINE_COLOR).first(),
    ).toBeVisible();

    const { id: dashboardId } = await mb.api.createDashboard({
      name: "Test Dashboard",
    });
    await addQuestionToDashboard(mb.api, { dashboardId, cardId });
    await visitDashboard(page, mb.api, dashboardId);

    const dashcard = page.getByTestId("dashcard");
    await expect(dashcard.getByTestId("chart-container")).toBeVisible();
    await expect(
      dashcard.locator(`path[fill="${DOOHICKEY_BAR_COLOR}"]`).first(),
    ).toBeAttached();
    await expect(
      dashcard
        .locator(`path[d="M1 0A1 1 0 1 1 1 -0.0001"][stroke="${GADGET_LINE_COLOR}"]`)
        .first(),
    ).toBeVisible();
  });
});

test.describe("issue #68819", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not crash when renaming an aggregation changes sibling column deduplication (metabase#68819)", async ({
    page,
    mb,
  }) => {
    // Create a question with two Sum of Total aggregations
    // These will be deduplicated as "sum" and "sum_2"
    const questionDetails = {
      display: "bar",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [
          ["sum", ["field", ORDERS.TOTAL, null]],
          ["sum", ["field", ORDERS.TOTAL, null]],
        ],
        breakout: [
          ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
        ],
      },
      visualization_settings: {
        "stackable.stack_type": "stacked",
        "graph.dimensions": ["CREATED_AT", "CATEGORY"],
        "graph.metrics": ["sum", "sum_2"],
      },
    };

    const { id } = await mb.api.createQuestion(questionDetails);
    await visitQuestion(page, id);

    await expect(echartsContainer(page)).toBeVisible();

    await openNotebook(page);

    await getNotebookStep(page, "summarize")
      .getByTestId("aggregate-step")
      .getByTestId("notebook-cell-item")
      .first()
      .click();

    await page.getByLabel("Back").click();

    await popover(page).getByText("Custom Expression", { exact: true }).click();

    const nameInput = page.getByTestId("expression-name");
    await nameInput.clear();
    await nameInput.fill("Sum");
    await popover(page).getByRole("button", { name: "Update", exact: true }).click();

    await saveSavedQuestion(page);

    await page.getByRole("button", { name: "Visualize", exact: true }).click();

    // The bug would cause: TypeError: cannot read properties of undefined (reading 'name')
    await expect(echartsContainer(page)).toBeVisible();
    await expect(
      page.getByTestId("query-builder-main").getByText(/error/i),
    ).toHaveCount(0);

    await page.reload();
    await expect(echartsContainer(page)).toBeVisible();
  });
});
