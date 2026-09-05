/**
 * Playwright port of
 * e2e/test/scenarios/visualizations-charts/line-bar-tooltips.cy.spec.js
 *
 * Hover tooltips on line/bar charts: series values, % of total, custom tooltip
 * columns, stacked totals, percent-change (incl. across DST boundaries).
 *
 * Mapping notes:
 * - `.trigger("mousemove")` on a chart circle → triggerMousemove (synthetic
 *   MouseEvent dispatch); `.realHover()` on a bar → hover() (wave-13 rule).
 *   Both are wrapped by showTooltipForCircleInSeries / showTooltipForBarInSeries
 *   (support/line-bar-tooltips.ts).
 * - `H.tooltipHeader(x)` takes NO args upstream — it asserts nothing. So the
 *   test*Change helpers assert rows only (no header); the direct
 *   H.assertEChartsTooltip({ header }) calls DO assert the header and keep it.
 * - `cy.findByRole("option", { name })` string args are exact (rule 1).
 * - `cy.contains(text)` in testTooltipExcludesText is case-sensitive substring.
 * - The @skip-tagged test is ported as test.skip (VIZ-671 series-color bug).
 * - DST/percent-change tests are date-derived — run with TZ=US/Pacific to match
 *   CI (the harness sets no timezoneId and inherits the process TZ).
 */
import { openVizSettingsSidebar, leftSidebar } from "../support/charts";
import { editDashboard, saveDashboard } from "../support/dashboard";
import { test, expect } from "../support/fixtures";
import { chartPathWithFillColor } from "../support/legend";
import {
  setup,
  showTooltipForBarInSeries,
  showTooltipForCircleInSeries,
  testAvgDiscountChange,
  testAvgTotalChange,
  testCumSumChange,
  testSumDiscountChange,
  testSumTotalChange,
  testTooltipExcludesText,
  updateColumnTitle,
} from "../support/line-bar-tooltips";
import { triggerMousemove } from "../support/line-chart";
import { cartesianChartCircles } from "../support/metrics";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { modal, visitDashboard } from "../support/ui";
import { showDashcardVisualizerModal } from "../support/visualizer-basics";
import {
  saveDashcardVisualizerModalSettings,
  showDashcardVisualizerModalSettings,
} from "../support/visualizer-cartesian";
import {
  assertEChartsTooltip,
  cartesianChartCircleWithColor,
  echartsTooltip,
  visitAdhoc,
} from "../support/viz-charts-repros";
import { assertEChartsTooltipNotContain } from "../support/waterfall";

const { ORDERS, ORDERS_ID, PRODUCTS } = SAMPLE_DATABASE;

const SUM_OF_TOTAL = {
  name: "Q1",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
  },
  display: "line",
};

const SUM_OF_TOTAL_MONTH = {
  name: "Q1",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
  },
  display: "line",
};

const SUM_OF_TOTAL_MONTH_EXCLUDE_MAY_AUG = {
  ...SUM_OF_TOTAL_MONTH,
  query: {
    filter: [
      "!=",
      [
        "field",
        "CREATED_AT",
        {
          "base-type": "type/DateTime",
          "temporal-unit": "month-of-year",
        },
      ],
      "2027-05-02",
      "2027-08-02",
    ],
    "source-query": {
      "source-table": ORDERS_ID,
      aggregation: [
        ["sum", ["field", ORDERS.TOTAL, { "base-type": "type/Float" }]],
      ],
      breakout: [
        [
          "field",
          ORDERS.CREATED_AT,
          { "base-type": "type/DateTime", "temporal-unit": "month" },
        ],
      ],
    },
  },
};

const SUM_OF_TOTAL_MONTH_ORDINAL = {
  ...SUM_OF_TOTAL_MONTH,
  visualization_settings: { "graph.x_axis.scale": "ordinal" },
};

const AVG_OF_TOTAL = {
  name: "Q2",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["avg", ["field", ORDERS.TOTAL, null]]],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
  },
  display: "line",
};

const AVG_OF_TOTAL_CUM_SUM_QUANTITY = {
  name: "Q1",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [
      ["avg", ["field", ORDERS.TOTAL, null]],
      ["cum-sum", ["field", ORDERS.QUANTITY, null]],
    ],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
  },
  display: "line",
};

const AVG_DISCOUNT_SUM_DISCOUNT = {
  name: "Q2",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [
      ["avg", ["field", ORDERS.DISCOUNT, null]],
      ["sum", ["field", ORDERS.DISCOUNT, null]],
    ],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
  },
  display: "line",
};

test.describe("scenarios > visualizations > line/bar chart > tooltips", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should be enterable and scrollable to view all rows in long tooltips (metabase#53586) (metabase#48347)", async ({
    page,
  }) => {
    const testQuestion = {
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
            [
              "field",
              ORDERS.TOTAL,
              { binning: { strategy: "num-bins", "num-bins": 50 } },
            ],
          ],
        },
        type: "query" as const,
      },
      display: "bar",
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT", "TOTAL"],
        "graph.metrics": ["count"],
      },
    };
    await visitAdhoc(page, testQuestion);

    // This tooltip is long and "enterable": moving the mouse INTO it freezes
    // ECharts' hover re-rendering, after which it can be scrolled. Without
    // entering it first, the bottom row detaches mid-scroll as ECharts keeps
    // re-rendering the hovered tooltip.
    await showTooltipForBarInSeries(page, "#A989C5", 3);
    const tooltip = echartsTooltip(page);
    await expect(tooltip).toBeVisible();
    const box = await tooltip.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);

    const bottomRow = tooltip.getByText("155 – 160", { exact: true }); // bottom row
    await bottomRow.scrollIntoViewIfNeeded();
    await expect(bottomRow).toBeVisible();
  });

  test.describe("> additional columns setting", () => {
    const COUNT = "Count";
    const SUM_OF_TOTAL_LABEL = "Sum of Total";
    const AVG_OF_QUANTITY = "Average of Quantity";

    const COUNT_COLOR = "#509EE3";
    const DOOHICKEY_COLOR = "#88BF4D";

    const testQuestion = {
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            ["count"],
            ["sum", ["field", ORDERS.TOTAL, null]],
            ["avg", ["field", ORDERS.QUANTITY, null]],
          ],
          breakout: [
            ["field", PRODUCTS.RATING, { "source-field": ORDERS.PRODUCT_ID }],
            ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
          ],
        },
        type: "query" as const,
      },
      display: "bar",
      visualization_settings: {
        "graph.x_axis.scale": "ordinal",
        "graph.dimensions": ["RATING"],
        "graph.metrics": ["count"],
      },
    };

    test("should allow adding non-series columns from data to the tooltip", async ({
      page,
    }) => {
      await visitAdhoc(page, testQuestion);

      // Tooltip by default shows only visible series data
      await showTooltipForBarInSeries(page, COUNT_COLOR);
      await assertEChartsTooltipNotContain(page, [
        SUM_OF_TOTAL_LABEL,
        AVG_OF_QUANTITY,
      ]);

      // Go to the additional tooltip columns setting
      await openVizSettingsSidebar(page);
      await leftSidebar(page).getByText("Display", { exact: true }).click();
      await leftSidebar(page)
        .getByPlaceholder("Enter column names", { exact: true })
        .click();

      // Select two additional columns to show in the tooltip
      await page
        .getByRole("option", { name: SUM_OF_TOTAL_LABEL, exact: true })
        .click();
      await page
        .getByRole("option", { name: AVG_OF_QUANTITY, exact: true })
        .click();
      // It should suggest categorical columns as well
      await expect(
        page.getByRole("option", { name: "Product → Category", exact: true }),
      ).toBeVisible();

      // Ensure the tooltip shows additional columns
      await showTooltipForBarInSeries(page, COUNT_COLOR);
      await assertEChartsTooltip(page, {
        header: "0",
        rows: [
          { name: COUNT, value: "2,308" },
          { name: SUM_OF_TOTAL_LABEL, value: "179,762.63" },
          { name: AVG_OF_QUANTITY, value: "15.32" },
        ],
      });

      // Add a breakout to the chart
      await leftSidebar(page).getByText("Data", { exact: true }).click();
      await leftSidebar(page)
        .getByText("Add series breakout", { exact: true })
        .click();

      // Ensure the tooltip still shows additional columns
      await showTooltipForBarInSeries(page, DOOHICKEY_COLOR);
      const assertBreakoutTooltip = async () => {
        await assertEChartsTooltip(page, {
          header: "0",
          rows: [
            { name: "Doohickey", value: "192" },
            { name: SUM_OF_TOTAL_LABEL, value: "20,345.44" },
            { name: AVG_OF_QUANTITY, value: "3.76" },
            { name: "Gadget", value: "653" },
            { name: "Gizmo", value: "370" },
            { name: "Widget", value: "1,093" },
          ],
        });
      };
      await assertBreakoutTooltip();

      // Make the chart stacked
      await leftSidebar(page).getByText("Display", { exact: true }).click();
      await leftSidebar(page).getByText("Stack", { exact: true }).click();

      // Ensure the tooltip still shows additional columns
      await showTooltipForBarInSeries(page, DOOHICKEY_COLOR);
      await assertBreakoutTooltip();
    });
  });

  test.describe("> single series question on dashboard", () => {
    test.beforeEach(async ({ page, mb }) => {
      const dashboardId = await setup(mb.api, { question: SUM_OF_TOTAL });
      await visitDashboard(page, mb.api, dashboardId);
    });

    test("should show updated column titles in tooltips after editing them via Visualization Options", async ({
      page,
    }) => {
      const originalName = "Sum of Total";
      const customName = "Custom";

      await triggerMousemove(cartesianChartCircles(page).first());
      await assertEChartsTooltip(page, {
        header: "2025",
        rows: [{ name: originalName, value: "42,156.87" }],
      });

      await editDashboard(page);
      await showDashcardVisualizerModalSettings(page, 0, {
        isVisualizerCard: false,
      });

      await updateColumnTitle(page, originalName, customName);

      await saveDashcardVisualizerModalSettings(page);
      await saveDashboard(page);

      await triggerMousemove(cartesianChartCircles(page).first());
      await assertEChartsTooltip(page, {
        header: "2025",
        rows: [{ name: customName, value: "42,156.87" }],
      });
    });

    test("should show percent change in tooltip for timeseries axis", async ({
      page,
    }) => {
      await testSumTotalChange(page);
    });
  });

  test.describe("> single series question on dashboard with added series", () => {
    test.beforeEach(async ({ page, mb }) => {
      const dashboardId = await setup(mb.api, {
        question: SUM_OF_TOTAL,
        addedSeriesQuestion: AVG_OF_TOTAL,
      });
      await visitDashboard(page, mb.api, dashboardId);
    });

    test("should show updated column titles in tooltips after editing them via Visualization Options", async ({
      page,
    }) => {
      const originalSeriesName = "Q1";
      const updatedOriginalSeriesName = "Custom Q1";
      const addedSeriesName = "Q2";
      const updatedAddedSeriesName = "Custom Q2";

      await showTooltipForCircleInSeries(page, "#88BF4D");
      await assertEChartsTooltip(page, {
        header: "2025",
        rows: [
          { color: "#88BF4D", name: originalSeriesName, value: "42,156.87" },
        ],
      });

      await showTooltipForCircleInSeries(page, "#A989C5");
      await assertEChartsTooltip(page, {
        header: "2025",
        rows: [{ color: "#A989C5", name: addedSeriesName, value: "56.66" }],
      });

      await editDashboard(page);
      await showDashcardVisualizerModal(page, 0, {
        isVisualizerCard: false,
      });
      await modal(page)
        .getByRole("button", { name: "Settings", exact: true })
        .click();
      await updateColumnTitle(page, originalSeriesName, updatedOriginalSeriesName);
      await updateColumnTitle(page, addedSeriesName, updatedAddedSeriesName);
      // Use the helper (instead of an inline Save click) so we wait for the
      // modal to close and the dashcard change to commit.
      await saveDashcardVisualizerModalSettings(page);
      await saveDashboard(page);

      await showTooltipForCircleInSeries(page, "#88BF4D");
      await assertEChartsTooltip(page, {
        header: "2025",
        rows: [
          {
            color: "#88BF4D",
            name: updatedOriginalSeriesName,
            value: "42,156.87",
          },
        ],
      });

      await showTooltipForCircleInSeries(page, "#A989C5");
      await assertEChartsTooltip(page, {
        header: "2025",
        rows: [
          { color: "#A989C5", name: updatedAddedSeriesName, value: "56.66" },
        ],
      });
    });

    test("should show percent change in tooltip for timeseries axis", async ({
      page,
    }) => {
      await testSumTotalChange(page, showTooltipForCircleInSeries, "Q1");
      await testAvgTotalChange(page, showTooltipForCircleInSeries, "Q2");
    });
  });

  test.describe("> multi series question on dashboard", () => {
    test.beforeEach(async ({ page, mb }) => {
      const dashboardId = await setup(mb.api, {
        question: AVG_OF_TOTAL_CUM_SUM_QUANTITY,
      });
      await visitDashboard(page, mb.api, dashboardId);
    });

    test("should show updated column titles in tooltips after editing them via Visualization Options", async ({
      page,
    }) => {
      const originalAvgSeriesName = "Average of Total";
      const originalCumSumSeriesName = "Cumulative sum of Quantity";
      const customAvgSeriesName = "Custom 1";
      const customCumSumSeriesName = "Custom 2";

      await triggerMousemove(cartesianChartCircles(page).first());
      await assertEChartsTooltip(page, {
        header: "2025",
        rows: [
          { color: "#A989C5", name: originalAvgSeriesName, value: "56.66" },
          { color: "#88BF4D", name: originalCumSumSeriesName, value: "3,236" },
        ],
      });

      await editDashboard(page);
      await showDashcardVisualizerModalSettings(page, 0, {
        isVisualizerCard: false,
      });

      await updateColumnTitle(page, originalAvgSeriesName, customAvgSeriesName);
      await updateColumnTitle(
        page,
        originalCumSumSeriesName,
        customCumSumSeriesName,
      );

      await saveDashcardVisualizerModalSettings(page);
      await saveDashboard(page);

      await triggerMousemove(cartesianChartCircles(page).first());
      // TODO also check the colors
      // TODO: VIZ-671/converting-a-multi-series-line-chart-swaps-the-series-colors
      await assertEChartsTooltip(page, {
        header: "2025",
        rows: [
          // color: "#A989C5",
          { name: customAvgSeriesName, value: "56.66" },
          // color: "#88BF4D",
          { name: customCumSumSeriesName, value: "3,236" },
        ],
      });
    });

    test("should show percent change in tooltip for timeseries axis", async ({
      page,
    }) => {
      await testAvgTotalChange(page);
      await testCumSumChange(page);
    });
  });

  test("tooltips should not fully cover small dashcards", async ({
    page,
    mb,
  }) => {
    const dashboardId = await setup(mb.api, {
      question: AVG_OF_TOTAL_CUM_SUM_QUANTITY,
      addedSeriesQuestion: AVG_DISCOUNT_SUM_DISCOUNT,
      cardSize: { x: 4, y: 4 },
    });
    await visitDashboard(page, mb.api, dashboardId);

    const firstCircle = cartesianChartCircleWithColor(page, "#A989C5").first();
    await triggerMousemove(firstCircle);

    // Ensure the tooltip is visible
    await assertEChartsTooltip(page, { header: "2025" });

    // Ensuring the circle is not covered by the tooltip element
    const circleRect = await firstCircle.boundingBox();
    const tooltipRect = await echartsTooltip(page).boundingBox();
    expect(circleRect).not.toBeNull();
    expect(tooltipRect).not.toBeNull();
    const isCovered =
      circleRect!.y < tooltipRect!.y + tooltipRect!.height &&
      circleRect!.y + circleRect!.height > tooltipRect!.y &&
      circleRect!.x < tooltipRect!.x + tooltipRect!.width &&
      circleRect!.x + circleRect!.width > tooltipRect!.x;

    expect(isCovered).toBe(false);
  });

  test("tooltips should be hidden when click popover is visible", async ({
    page,
    mb,
  }) => {
    const dashboardId = await setup(mb.api, {
      question: AVG_OF_TOTAL_CUM_SUM_QUANTITY,
    });
    await visitDashboard(page, mb.api, dashboardId);

    const firstCircle = cartesianChartCircleWithColor(page, "#A989C5").first();
    await triggerMousemove(firstCircle);

    // Ensure the tooltip is visible
    await assertEChartsTooltip(page, { header: "2025" });

    await firstCircle.click();

    // should("be.hidden") → no visible echarts tooltip remains
    await expect(
      page.getByTestId("echarts-tooltip").filter({ visible: true }),
    ).toHaveCount(0);
  });

  test.describe("> multi series question on dashboard with added question", () => {
    test.beforeEach(async ({ page, mb }) => {
      const dashboardId = await setup(mb.api, {
        question: AVG_OF_TOTAL_CUM_SUM_QUANTITY,
        addedSeriesQuestion: AVG_DISCOUNT_SUM_DISCOUNT,
      });
      await visitDashboard(page, mb.api, dashboardId);
    });

    // TODO: Fix series have different colors in visualizer because of different
    // column names in original dashcard and visualizer ("avg" becomes "COLUMN_2"
    // and the color is different) — upstream tags this @skip (VIZ-671).
    test.skip("should show updated column titles in tooltips after editing them via Visualization Options", async ({
      page,
    }) => {
      // Checking the second datum since the first circle of one series is
      // covered with a circle from the other series
      const circleIndex = 1;

      const originalSeriesColors = ["#A989C5", "#88BF4D"];
      const addedSeriesColors = ["#509EE3", "#98D9D9"];
      const originalAvgSeriesName = "Q1: Average of Total";
      const originalCumSumSeriesName = "Q1: Cumulative sum of Quantity";
      const updatedOriginalAvgSeriesName = "Q1 Custom 1";
      const updatedOriginalCumSumSeriesName = "Q1 Custom 2";
      const addedAvgSeriesName = "Q2: Average of Discount";
      const addedSumSeriesName = "Q2: Sum of Discount";
      const updatedAddedAvgSeriesName = "Q2 Custom 1";
      const updatedAddedSumSeriesName = "Q2 Custom 2";

      for (const color of [...originalSeriesColors, ...addedSeriesColors]) {
        await showTooltipForCircleInSeries(page, color, circleIndex);
        await assertEChartsTooltip(page, {
          header: "2026",
          rows: [
            {
              color: originalSeriesColors[0],
              name: originalAvgSeriesName,
              value: "56.86",
            },
            {
              color: originalSeriesColors[1],
              name: originalCumSumSeriesName,
              value: "17,587",
            },
            {
              color: addedSeriesColors[0],
              name: addedAvgSeriesName,
              value: "5.41",
            },
            {
              color: addedSeriesColors[1],
              name: addedSumSeriesName,
              value: "1,953.08",
            },
          ],
        });
      }

      await editDashboard(page);
      await showDashcardVisualizerModalSettings(page, 0, {
        isVisualizerCard: false,
      });

      await updateColumnTitle(
        page,
        originalAvgSeriesName,
        updatedOriginalAvgSeriesName,
      );
      await updateColumnTitle(
        page,
        originalCumSumSeriesName,
        updatedOriginalCumSumSeriesName,
      );

      await updateColumnTitle(
        page,
        addedAvgSeriesName,
        updatedAddedAvgSeriesName,
      );
      await updateColumnTitle(
        page,
        addedSumSeriesName,
        updatedAddedSumSeriesName,
      );

      await saveDashcardVisualizerModalSettings(page);
      await saveDashboard(page);

      for (const color of [...originalSeriesColors, ...addedSeriesColors]) {
        await showTooltipForCircleInSeries(page, color, circleIndex);
        await assertEChartsTooltip(page, {
          header: "2026",
          rows: [
            {
              color: originalSeriesColors[0],
              name: updatedOriginalAvgSeriesName,
              value: "56.86",
            },
            {
              color: originalSeriesColors[1],
              name: updatedOriginalCumSumSeriesName,
              value: "17,587",
            },
            {
              color: addedSeriesColors[0],
              name: updatedAddedAvgSeriesName,
              value: "5.41",
            },
            {
              color: addedSeriesColors[1],
              name: updatedAddedSumSeriesName,
              value: "1,953.08",
            },
          ],
        });
      }
    });

    test("should show percent change in tooltip for timeseries axis", async ({
      page,
    }) => {
      await testAvgTotalChange(
        page,
        showTooltipForCircleInSeries,
        "Q1: Average of Total",
      );
      await testCumSumChange(page, false, "Q1: Cumulative sum of Quantity");
      await testAvgDiscountChange(page, "Q2: Average of Discount");
      await testSumDiscountChange(page, "Q2: Sum of Discount");
    });
  });

  test.describe("> bar chart question on dashboard", () => {
    test.beforeEach(async ({ page, mb }) => {
      const dashboardId = await setup(mb.api, {
        question: { ...SUM_OF_TOTAL, display: "bar" },
      });
      await visitDashboard(page, mb.api, dashboardId);
    });

    test("should show updated column titles in tooltips after editing them via Visualization Options", async ({
      page,
    }) => {
      const originalName = "Sum of Total";
      const updatedName = "Custom";

      await triggerMousemove(chartPathWithFillColor(page, "#88BF4D").first());
      await assertEChartsTooltip(page, {
        header: "2025",
        rows: [{ color: "#88BF4D", name: originalName, value: "42,156.87" }],
      });

      await editDashboard(page);
      await showDashcardVisualizerModalSettings(page, 0, {
        isVisualizerCard: false,
      });

      await updateColumnTitle(page, originalName, updatedName);

      await saveDashcardVisualizerModalSettings(page);
      await saveDashboard(page);

      await triggerMousemove(chartPathWithFillColor(page, "#88BF4D").first());
      await assertEChartsTooltip(page, {
        header: "2025",
        rows: [{ color: "#88BF4D", name: updatedName, value: "42,156.87" }],
      });
    });

    test("should show percent change in tooltip for timeseries axis", async ({
      page,
    }) => {
      await testSumTotalChange(page, showTooltipForBarInSeries);
    });
  });

  test.describe("> bar chart question on dashboard with added series", () => {
    test.beforeEach(async ({ page, mb }) => {
      const dashboardId = await setup(mb.api, {
        question: { ...SUM_OF_TOTAL, display: "bar" },
        addedSeriesQuestion: { ...AVG_OF_TOTAL, display: "bar" },
      });
      await visitDashboard(page, mb.api, dashboardId);
    });

    test("should show updated column titles in tooltips after editing them via Visualization Options", async ({
      page,
    }) => {
      const originalSeriesColor = "#88BF4D";
      const addedSeriesColor = "#A989C5";
      const originalSeriesName = "Q1";
      const updatedOriginalSeriesName = "Custom Q1";
      const addedSeriesName = "Q2";
      const updatedAddedSeriesName = "Custom Q2";

      await showTooltipForBarInSeries(page, originalSeriesColor, 0);
      await assertEChartsTooltip(page, {
        header: "2025",
        rows: [
          { color: "#88BF4D", name: originalSeriesName, value: "42,156.87" },
        ],
      });

      await showTooltipForBarInSeries(page, addedSeriesColor, 0);
      await assertEChartsTooltip(page, {
        header: "2025",
        rows: [{ color: "#A989C5", name: addedSeriesName, value: "56.66" }],
      });

      await editDashboard(page);
      await showDashcardVisualizerModalSettings(page, 0, {
        isVisualizerCard: false,
      });

      await updateColumnTitle(page, originalSeriesName, updatedOriginalSeriesName);
      await updateColumnTitle(page, addedSeriesName, updatedAddedSeriesName);

      await saveDashcardVisualizerModalSettings(page);
      await saveDashboard(page);

      await showTooltipForBarInSeries(page, originalSeriesColor, 0);
      await assertEChartsTooltip(page, {
        header: "2025",
        rows: [
          {
            color: "#88BF4D",
            name: updatedOriginalSeriesName,
            value: "42,156.87",
          },
        ],
      });

      await showTooltipForBarInSeries(page, addedSeriesColor, 0);
      await assertEChartsTooltip(page, {
        header: "2025",
        rows: [
          { color: "#A989C5", name: updatedAddedSeriesName, value: "56.66" },
        ],
      });
    });

    test("should show percent change in tooltip for timeseries axis", async ({
      page,
    }) => {
      await testSumTotalChange(page, showTooltipForBarInSeries, "Q1");
      await testAvgTotalChange(page, showTooltipForBarInSeries, "Q2");
    });
  });

  test.describe("> single series question grouped by month on dashboard", () => {
    test("should show percent change in tooltip for timeseries axis", async ({
      page,
      mb,
    }) => {
      const dashboardId = await setup(mb.api, { question: SUM_OF_TOTAL_MONTH });
      await visitDashboard(page, mb.api, dashboardId);

      await showTooltipForCircleInSeries(page, "#88BF4D", 0);
      await assertEChartsTooltip(page, {
        header: "April 2025",
        rows: [{ color: "#88BF4D", name: "Sum of Total", value: "52.76" }],
      });
      await testTooltipExcludesText(page, "Compared to previous month");

      await showTooltipForCircleInSeries(page, "#88BF4D", 1);
      await assertEChartsTooltip(page, {
        header: "May 2025",
        rows: [
          {
            color: "#88BF4D",
            name: "Sum of Total",
            value: "1,265.72",
            secondaryValue: "+2,299.19%",
          },
        ],
      });
    });

    test("should not show percent change when previous month is missing from result data", async ({
      page,
      mb,
    }) => {
      const dashboardId = await setup(mb.api, {
        question: SUM_OF_TOTAL_MONTH_EXCLUDE_MAY_AUG,
      });
      await visitDashboard(page, mb.api, dashboardId);

      await showTooltipForCircleInSeries(page, "#88BF4D", 0);
      await assertEChartsTooltip(page, {
        header: "April 2025",
        rows: [{ color: "#88BF4D", name: "Sum of Total", value: "52.76" }],
      });
      await testTooltipExcludesText(page, "Compared to previous month");

      await showTooltipForCircleInSeries(page, "#88BF4D", 1);
      await assertEChartsTooltip(page, {
        header: "June 2025",
        rows: [{ color: "#88BF4D", name: "Sum of Total", value: "2,072.94" }],
      });
      await testTooltipExcludesText(page, "Compared to previous month");

      await showTooltipForCircleInSeries(page, "#88BF4D", 2);
      await assertEChartsTooltip(page, {
        header: "July 2025",
        rows: [
          {
            color: "#88BF4D",
            name: "Sum of Total",
            value: "3,734.69",
            secondaryValue: "+80.16%",
          },
        ],
      });

      await showTooltipForCircleInSeries(page, "#88BF4D", 3);
      await assertEChartsTooltip(page, {
        header: "September 2025",
        rows: [{ color: "#88BF4D", name: "Sum of Total", value: "5,372.08" }],
      });
      await testTooltipExcludesText(page, "Compared to previous month");
    });

    test("should not show if x-axis is not timeseries", async ({
      page,
      mb,
    }) => {
      const dashboardId = await setup(mb.api, {
        question: SUM_OF_TOTAL_MONTH_ORDINAL,
      });
      await visitDashboard(page, mb.api, dashboardId);

      await showTooltipForCircleInSeries(page, "#88BF4D", 0);
      await assertEChartsTooltip(page, {
        header: "April 2025",
        rows: [{ color: "#88BF4D", name: "Sum of Total", value: "52.76" }],
      });
      await testTooltipExcludesText(page, "Compared to previous month");

      await showTooltipForCircleInSeries(page, "#88BF4D", 1);
      await assertEChartsTooltip(page, {
        header: "May 2025",
        rows: [{ color: "#88BF4D", name: "Sum of Total", value: "1,265.72" }],
      });

      await testTooltipExcludesText(page, "Compared to previous month");
    });
  });

  test.describe("> percent change across daylight savings time change", () => {
    const SUM_OF_TOTAL_APRIL = {
      name: "Q1",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
        filter: [
          "between",
          ["field", ORDERS.CREATED_AT, { "base-type": "type/DateTime" }],
          "2027-01-01",
          "2027-05-30",
        ],
      },
      display: "line",
    };

    const APRIL_CHANGES = [null, "-10.89%", "+11.1%", "-2.89%"];

    const SUM_OF_TOTAL_DST_WEEK = {
      name: "Q1",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "week" }]],
        filter: [
          "between",
          ["field", ORDERS.CREATED_AT, { "base-type": "type/DateTime" }],
          "2027-03-01",
          "2027-03-31",
        ],
      },
      display: "line",
    };

    const DST_WEEK_CHANGES = [null, "+27.3%", "-5.8%", "-1.36%"]; // fragile - depends on the year

    const SUM_OF_TOTAL_DST_DAY = {
      name: "Q1",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["sum", ["field", ORDERS.TOTAL, null]]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "day" }]],
        filter: [
          "between",
          ["field", ORDERS.CREATED_AT, { "base-type": "type/DateTime" }],
          "2027-03-09",
          "2027-03-12",
        ],
      },
      display: "line",
    };

    const DST_DAY_CHANGES = [null, "+27.5%", "-26.16%"];

    test("should not omit percent change on April", async ({ page, mb }) => {
      const dashboardId = await setup(mb.api, { question: SUM_OF_TOTAL_APRIL });
      await visitDashboard(page, mb.api, dashboardId);

      for (const [index, change] of APRIL_CHANGES.entries()) {
        await showTooltipForCircleInSeries(page, "#88BF4D", index);
        if (change === null) {
          await testTooltipExcludesText(page, "Compared to previous");
          continue;
        }
        await assertEChartsTooltip(page, {
          rows: [
            { color: "#88BF4D", name: "Sum of Total", secondaryValue: change },
          ],
        });
      }
    });

    test("should not omit percent change the week after DST begins", async ({
      page,
      mb,
    }) => {
      const dashboardId = await setup(mb.api, {
        question: SUM_OF_TOTAL_DST_WEEK,
      });
      await visitDashboard(page, mb.api, dashboardId);

      for (const [index, change] of DST_WEEK_CHANGES.entries()) {
        await showTooltipForCircleInSeries(page, "#88BF4D", index);
        if (change === null) {
          await testTooltipExcludesText(page, "Compared to previous");
          continue;
        }
        await assertEChartsTooltip(page, {
          rows: [
            { color: "#88BF4D", name: "Sum of Total", secondaryValue: change },
          ],
        });
      }
    });

    test("should not omit percent change the day after DST begins", async ({
      page,
      mb,
    }) => {
      const dashboardId = await setup(mb.api, {
        question: SUM_OF_TOTAL_DST_DAY,
      });
      await visitDashboard(page, mb.api, dashboardId);

      for (const [index, change] of DST_DAY_CHANGES.entries()) {
        await showTooltipForCircleInSeries(page, "#88BF4D", index);
        if (change === null) {
          await testTooltipExcludesText(page, "Compared to previous");
          continue;
        }
        await assertEChartsTooltip(page, {
          rows: [
            { color: "#88BF4D", name: "Sum of Total", secondaryValue: change },
          ],
        });
      }
    });
  });
});
