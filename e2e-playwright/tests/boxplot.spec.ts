/**
 * Playwright port of
 * e2e/test/scenarios/visualizations-charts/boxplot.cy.spec.js
 *
 * New helpers (getBoxes / getPoints / getMeanMarkers / triggerMousemoveLeft /
 * clickLeft / hoverChartTop) live in support/boxplot.ts; everything else is
 * imported read-only from the shared modules.
 *
 * Mapping notes:
 * - `H.visitQuestionAdhoc(structured question with display + viz settings)` →
 *   visitAdhoc (the widened adhoc wrapper in viz-charts-repros).
 * - `.trigger("mousemove", "left")` on a box → triggerMousemoveLeft (synthetic
 *   dispatch at the left edge, dodging the mean-marker overlap); a bare
 *   `.trigger("mousemove")` on an outlier → the shared triggerMousemove
 *   (synthetic dispatch at center).
 * - `.click("left")` on a box → clickLeft; a bare `.click()` on an outlier →
 *   locator.click() (center).
 * - `realHover({ position: "top" })` to reset focus/blur → hoverChartTop.
 * - ECharts SVG <text> carries leading/trailing spaces, so chart-text
 *   existence/visibility checks go through echartsExactText (whitespace-tolerant
 *   exact regex), never getByText exact.
 * - `cy.findByText(str)` (testing-library, exact) → getByText(str, exact:true);
 *   `.should("exist")` → toBeAttached, `.should("not.exist")` → toHaveCount(0),
 *   `.should("be.visible")` → toBeVisible.
 * - `H.tableInteractiveBody().contains(str)` → tableInteractiveBody scoped
 *   getByText(caseSensitiveSubstring(str)) (cy.contains = case-sensitive
 *   substring, first match).
 * - `findAllByTestId("legend-item").should("contain", str)` is an ANY-of-set
 *   assertion → filter({ hasText }) with a nonzero count.
 */
import { openVizSettingsSidebar, echartsContainer, leftSidebar } from "../support/charts";
import { createQuestionAndDashboard } from "../support/factories";
import { findByDisplayValue } from "../support/filters-repros";
import { test, expect } from "../support/fixtures";
import { echartsExactText, openSeriesSettings, triggerMousemove } from "../support/line-chart";
import { tableInteractiveBody } from "../support/question-new";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { caseSensitiveSubstring } from "../support/text";
import { popover, visitDashboard } from "../support/ui";
import { goalLine } from "../support/visualizer-basics";
import { assertEChartsTooltip, visitAdhoc } from "../support/viz-charts-repros";
import {
  clickLeft,
  getBoxes,
  getMeanMarkers,
  getPoints,
  hoverChartTop,
  triggerMousemoveLeft,
} from "../support/boxplot";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const testQuery = {
  type: "query" as const,
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
};

const singleSeriesQuestion = {
  dataset_query: testQuery,
  display: "boxplot",
  visualization_settings: {
    "graph.dimensions": ["CREATED_AT"],
  },
};

test.describe("scenarios > visualizations > boxplot", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should render boxplot and update chart on display settings changes", async ({
    page,
  }) => {
    await visitAdhoc(page, singleSeriesQuestion);

    // 5 Boxes: 2025-2029
    await expect(getBoxes(page)).toHaveCount(5);

    // By default: Tukey whiskers, outliers shown, mean shown
    await expect(getPoints(page)).toHaveCount(1); // Only one outlier
    await expect(getMeanMarkers(page)).toHaveCount(5);

    // Open settings and change whisker type to Min/Max
    await openVizSettingsSidebar(page);
    await leftSidebar(page).getByText("Display", { exact: true }).click();
    await expect(
      leftSidebar(page).getByText("Whiskers extend to", { exact: true }),
    ).toBeAttached();
    await expect(
      leftSidebar(page).getByText("1.5 × interquartile range", { exact: true }),
    ).toBeAttached();
    await leftSidebar(page).getByText("Min/Max", { exact: true }).click();

    // With Min/Max whiskers, there should be no outliers
    await expect(getPoints(page)).toHaveCount(0);

    // "Outliers only" option should be hidden when Min/Max is selected
    await expect(
      leftSidebar(page).getByText("Outliers only", { exact: true }),
    ).toHaveCount(0);

    // Change points mode to show all points
    await leftSidebar(page).getByText("All points", { exact: true }).click();
    await expect.poll(() => getPoints(page).count()).toBeGreaterThanOrEqual(5);

    // Hide points entirely
    await leftSidebar(page).getByText("None", { exact: true }).click();
    await expect(getPoints(page)).toHaveCount(0);

    // Toggle mean off
    await leftSidebar(page).getByText("Show mean", { exact: true }).click();
    await expect(getMeanMarkers(page)).toHaveCount(0);

    // Toggle mean back on
    await leftSidebar(page).getByText("Show mean", { exact: true }).click();
    await expect(getMeanMarkers(page)).toHaveCount(5);
  });

  test("should show and configure data labels", async ({ page }) => {
    await visitAdhoc(page, singleSeriesQuestion);

    await openVizSettingsSidebar(page);
    await leftSidebar(page).getByText("Display", { exact: true }).click();
    await leftSidebar(page)
      .getByText("Show values on data points", { exact: true })
      .click();

    // After enabling, "Values to display" option appears with segmented buttons
    await expect(
      leftSidebar(page).getByText("Values to display", { exact: true }),
    ).toBeAttached();
    await expect(
      leftSidebar(page).getByRole("button", { name: "Median only", exact: true }),
    ).toBeAttached();
    await leftSidebar(page)
      .getByRole("button", { name: "All", exact: true })
      .click();

    // Verify label value appears
    await expect(echartsExactText(page, "412").first()).toBeAttached();

    // Disable "Hide overlapping labels" to show more labels
    await leftSidebar(page)
      .getByText("Hide overlapping labels", { exact: true })
      .click();
    await expect(echartsExactText(page, "91.75").first()).toBeAttached();

    // Test "Auto formatting" segmented button
    await expect(
      leftSidebar(page).getByText("Auto formatting", { exact: true }),
    ).toBeAttached();
    await leftSidebar(page)
      .getByRole("button", { name: "Full", exact: true })
      .click();
  });

  test("should display tooltips on hover", async ({ page }) => {
    await visitAdhoc(page, singleSeriesQuestion);

    // Hover over a box element from the left side to avoid mean marker overlap
    await triggerMousemoveLeft(getBoxes(page).first());
    await assertEChartsTooltip(page, {
      header: "2025",
      rows: [
        { name: "Upper whisker", value: "84" },
        { name: "Q3 (75th percentile)", value: "59" },
        { name: "Median", value: "35" },
        { name: "Mean", value: "39.16" },
        { name: "Q1 (25th percentile)", value: "15.5" },
        { name: "Lower whisker", value: "1" },
      ],
    });

    // Hover over the outlier point
    await triggerMousemove(getPoints(page).first());
    await assertEChartsTooltip(page, {
      header: "2029 (outlier)",
      rows: [
        { name: "Count", value: "189" },
        { name: "Total: 50 bins", value: "70 – 75" },
      ],
    });
  });

  test("should support axis customization", async ({ page }) => {
    await visitAdhoc(page, singleSeriesQuestion);

    await openVizSettingsSidebar(page);
    await leftSidebar(page).getByText("Axes", { exact: true }).click();

    // Add y-axis label
    await (await findByDisplayValue(leftSidebar(page), "Count")).fill(
      "Count Label",
    );
    await expect(echartsExactText(page, "Count Label").first()).toBeAttached();

    // Add x-axis label
    await (
      await findByDisplayValue(leftSidebar(page), "Created At: Year")
    ).fill("Year Label");
    await expect(echartsExactText(page, "Year Label").first()).toBeAttached();

    // Toggle auto y-axis range
    // Before toggling auto y-axis range, the y-axis labels contains 600
    await expect(echartsExactText(page, "600").first()).toBeAttached();

    await leftSidebar(page).getByText("Auto y-axis range", { exact: true }).click();
    // Y-axis label since default non-auto range is [0, 100]
    await expect(echartsExactText(page, "100").first()).toBeAttached();
    await expect(echartsExactText(page, "600")).toHaveCount(0);
  });

  test("should display goal line when configured", async ({ page }) => {
    await visitAdhoc(page, singleSeriesQuestion);

    await openVizSettingsSidebar(page);
    await leftSidebar(page).getByText("Display", { exact: true }).click();
    await leftSidebar(page).getByText("Goal line", { exact: true }).click();

    await leftSidebar(page).getByLabel("Goal value", { exact: true }).fill("100");
    await leftSidebar(page).getByLabel("Goal label", { exact: true }).fill("Target");

    await expect(echartsExactText(page, "Target").first()).toBeAttached();
    await expect(goalLine(page).first()).toBeAttached();
  });

  test("should render in dashboard and support drill-through on boxes and outliers", async ({
    page,
    mb,
  }) => {
    const dashcard = await createQuestionAndDashboard(mb.api, {
      questionDetails: {
        name: "BoxPlot Dashboard Test",
        query: singleSeriesQuestion.dataset_query.query,
        display: "boxplot",
        visualization_settings: singleSeriesQuestion.visualization_settings,
      },
    });
    await visitDashboard(page, mb.api, dashcard.dashboard_id);

    await expect(echartsContainer(page)).toBeVisible();
    // Verify boxplot renders in dashboard context (5 boxes: 2025-2029)
    await expect(getBoxes(page)).toHaveCount(5);
    await expect(getMeanMarkers(page)).toHaveCount(5);

    // Click on a box to trigger drill-through (click left to avoid mean marker overlap)
    await clickLeft(getBoxes(page).first());

    // Click "See these Orders" to drill down
    await popover(page).getByText("See these Orders", { exact: true }).click();

    // Should navigate to filtered table view with dimension filter applied
    await expect(page.getByTestId("filter-pill")).toHaveText(
      "Created At: Year is Jan 1 – Dec 31, 2025",
    );

    // Verify we're viewing a table with results
    await expect(
      tableInteractiveBody(page)
        .getByText(caseSensitiveSubstring("79.37"))
        .first(),
    ).toBeVisible();

    // Go back to dashboard
    await page.getByLabel("Back to Test Dashboard", { exact: true }).click();

    // Click on an outlier point
    await getPoints(page).first().click();

    // Should show drill options
    await expect(
      popover(page).getByText("See these Orders", { exact: true }),
    ).toBeAttached();

    await popover(page).getByText("See these Orders", { exact: true }).click();

    // Should filter to specific dimension and show table
    await expect(page.getByTestId("filter-pill")).toHaveText(
      "Created At: Year is Jan 1 – Dec 31, 2029",
    );

    // Verify we're viewing a table with results
    await expect(
      tableInteractiveBody(page)
        .getByText(caseSensitiveSubstring("97.44"))
        .first(),
    ).toBeVisible();
  });

  test.describe("multi-series", () => {
    const breakoutQuery = {
      type: "query" as const,
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
          ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
        ],
      },
    };

    const twoMetricsQuery = {
      type: "query" as const,
      database: SAMPLE_DB_ID,
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"], ["sum", ["field", ORDERS.QUANTITY, null]]],
        breakout: [
          ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
          [
            "field",
            ORDERS.TOTAL,
            { binning: { strategy: "num-bins", "num-bins": 50 } },
          ],
        ],
      },
    };

    test("should render boxplot with breakout (two dimensions, one metric)", async ({
      page,
    }) => {
      await visitAdhoc(page, {
        dataset_query: breakoutQuery,
        display: "boxplot",
      });

      // Select dimensions via UI
      await openVizSettingsSidebar(page);
      await leftSidebar(page).getByText("Data", { exact: true }).click();

      // Configure dimensions
      await leftSidebar(page)
        .getByPlaceholder("Select a field", { exact: true })
        .nth(0)
        .click();
      await popover(page).getByText("Created At: Year", { exact: true }).click();
      await leftSidebar(page)
        .getByText("Add series breakout", { exact: true })
        .click();
      await popover(page).getByText("Product → Category", { exact: true }).click();

      // Configure metrics
      await leftSidebar(page)
        .getByPlaceholder("Select a field", { exact: true })
        .nth(2)
        .click();
      await popover(page).getByText("Count", { exact: true }).click();

      // Should have legend items for each category
      await expect(page.getByTestId("legend-item")).toHaveCount(4);
      for (const name of ["Doohickey", "Gadget", "Gizmo", "Widget"]) {
        await expect(
          page.getByTestId("legend-item").filter({ hasText: name }),
        ).not.toHaveCount(0);
      }

      // Should have 5 boxes per category (5 years × 4 categories = 20 boxes)
      await expect(getBoxes(page)).toHaveCount(20);

      // Hover over a box and verify tooltip shows breakout value
      await triggerMousemoveLeft(getBoxes(page).first());
      await assertEChartsTooltip(page, {
        header: "2025",
        rows: [
          { name: "Product → Category", value: "Gadget" },
          { name: "Upper whisker", value: "25" },
          { name: "Q3 (75th percentile)", value: "18.25" },
          { name: "Median", value: "12" },
          { name: "Mean", value: "12.44" },
          { name: "Q1 (25th percentile)", value: "6.5" },
          { name: "Lower whisker", value: "1" },
        ],
      });

      // Hide first series (Doohickey)
      await page
        .getByTestId("legend-item")
        .nth(0)
        .getByLabel("Hide series", { exact: true })
        .click();
      await expect(getBoxes(page)).toHaveCount(15);

      // Show it back
      await page
        .getByTestId("legend-item")
        .nth(0)
        .getByLabel("Show series", { exact: true })
        .click();
      // Move mouse away to reset focus/blur state
      await hoverChartTop(page);
      await expect(getBoxes(page)).toHaveCount(20);

      // Verify drill-through includes both dimension and breakout filters
      await clickLeft(getBoxes(page).first());
      await popover(page).getByText("See these Orders", { exact: true }).click();

      await expect(page.getByTestId("filter-pill")).toHaveCount(2);
      await expect(page.getByTestId("filter-pill").nth(0)).toHaveText(
        "Created At: Year is Jan 1 – Dec 31, 2025",
      );
      await expect(page.getByTestId("filter-pill").nth(1)).toHaveText(
        "Product → Category is Doohickey",
      );

      await expect(tableInteractiveBody(page)).toBeAttached();
    });

    test("should render boxplot with two metrics", async ({ page }) => {
      await visitAdhoc(page, {
        dataset_query: twoMetricsQuery,
        display: "boxplot",
      });

      // Select via UI
      await openVizSettingsSidebar(page);
      await leftSidebar(page).getByText("Data", { exact: true }).click();

      // Configure dimension
      await leftSidebar(page)
        .getByPlaceholder("Select a field", { exact: true })
        .nth(0)
        .click();
      await popover(page).getByText("Created At: Year", { exact: true }).click();

      // Should have legend items for each metric
      await expect(page.getByTestId("legend-item")).toHaveCount(2);
      for (const name of ["Count", "Sum of Quantity"]) {
        await expect(
          page.getByTestId("legend-item").filter({ hasText: name }),
        ).not.toHaveCount(0);
      }

      // Should have 5 boxes per metric (5 years × 2 metrics = 10 boxes)
      await expect(getBoxes(page)).toHaveCount(10);

      // Hover over a box from the first metric and verify tooltip
      await triggerMousemoveLeft(getBoxes(page).first());
      await assertEChartsTooltip(page, {
        header: "2025",
        rows: [
          { name: "Upper whisker", value: "84" },
          { name: "Q3 (75th percentile)", value: "59" },
          { name: "Median", value: "35" },
          { name: "Mean", value: "39.16" },
          { name: "Q1 (25th percentile)", value: "15.5" },
          { name: "Lower whisker", value: "1" },
        ],
      });

      // Hide first series (Count)
      await page
        .getByTestId("legend-item")
        .nth(0)
        .getByLabel("Hide series", { exact: true })
        .click();
      await expect(getBoxes(page)).toHaveCount(5);

      // Show it back
      await page
        .getByTestId("legend-item")
        .nth(0)
        .getByLabel("Show series", { exact: true })
        .click();
      // Move mouse away to reset focus/blur state
      await hoverChartTop(page);
      await expect(getBoxes(page)).toHaveCount(10);

      // Verify drill-through applies dimension filter
      await clickLeft(getBoxes(page).first());
      await popover(page).getByText("See these Orders", { exact: true }).click();

      await expect(page.getByTestId("filter-pill")).toHaveText(
        "Created At: Year is Jan 1 – Dec 31, 2025",
      );

      await expect(tableInteractiveBody(page)).toBeAttached();
    });
  });

  test("should support value formatting, axis settings, and series customization", async ({
    page,
  }) => {
    // Use Products table: Average of Price by Category and Created at (year)
    const priceByYearQuery = {
      type: "query" as const,
      database: SAMPLE_DB_ID,
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["avg", ["field", PRODUCTS.PRICE, null]]],
        breakout: [
          ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "year" }],
          ["field", PRODUCTS.CATEGORY, null],
        ],
      },
    };

    await visitAdhoc(page, {
      dataset_query: priceByYearQuery,
      display: "boxplot",
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["avg"],
        "graph.show_values": true,
      },
    });

    await expect(getBoxes(page)).toHaveCount(4);

    // Set currency formatting via UI using series settings
    await openVizSettingsSidebar(page);
    await openSeriesSettings(page, "Average of Price");
    await popover(page).getByText("Formatting", { exact: true }).click();
    await popover(page).getByLabel("Style", { exact: true }).click();
    await popover(page).getByText("Currency", { exact: true }).click();

    // Verify formatted value appears in labels (should have $ prefix)
    await expect(echartsExactText(page, "$52.13").first()).toBeVisible();
    await page.getByRole("button", { name: "Done", exact: true }).click();

    // Verify formatted tooltip with all currency values
    await triggerMousemoveLeft(getBoxes(page).first());
    await assertEChartsTooltip(page, {
      header: "2025",
      rows: [
        { name: "Upper whisker", value: "$53.93" },
        { name: "Q3 (75th percentile)", value: "$53.93" },
        { name: "Median", value: "$52.13" },
        { name: "Mean", value: "$52.94" },
        { name: "Q1 (25th percentile)", value: "$51.13" },
        { name: "Lower whisker", value: "$48.62" },
      ],
    });

    await openVizSettingsSidebar(page);
    await leftSidebar(page).getByText("Axes", { exact: true }).click();

    // Default: pinned to zero, y-axis should include 0
    await expect(echartsExactText(page, "$0").first()).toBeVisible();
    await leftSidebar(page).getByText("Unpin from zero", { exact: true }).click();

    // After unpinning, 0 should not be visible (y-axis starts higher since prices are ~$40-80)
    await expect(echartsExactText(page, "$0")).toHaveCount(0);
  });
});
