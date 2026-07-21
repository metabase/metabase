/**
 * Playwright port of
 * e2e/test/scenarios/visualizations-tabular/drillthroughs/chart_drill.cy.spec.js
 *
 * Notes:
 * - Snowplow helpers (resetSnowplow / enableTracking / expectNoBadSnowplowEvents /
 *   expectUnstructuredSnowplowEvent) are no-op stubs — no snowplow-micro
 *   container in the spike harness (PORTING.md rule 6). The "chart click
 *   actions analytics" describe still exercises the full UI; only the event
 *   assertions are stubbed away.
 * - H.createQuestion(details, { visitQuestion: true }) → api.createQuestion +
 *   visitQuestion(page, id).
 * - cy.wait("@dataset") pairs → page.waitForResponse registered before the
 *   triggering action.
 */
import { addOrUpdateDashboardCard } from "../support/drillthroughs";
import { chartPathWithFillColor, openTable } from "../support/binning";
import { brushChart, pieSliceWithColor } from "../support/chart-drill";
import { echartsContainer, leftSidebar } from "../support/charts";
import { DATA_GROUP } from "../support/collections-core";
import { createNativeQuestion } from "../support/dashboard-management";
// The faithful H.startNewQuestion navigates to /question/notebook#<hash>
// (e2e-ad-hoc-question-helpers.js); notebook.ts's same-named port instead
// clicks the app-bar, which needs an already-loaded page.
import { startNewQuestion } from "../support/data-model";
import { test, expect } from "../support/fixtures";
import { addSummaryField } from "../support/joins";
import { findByDisplayValue } from "../support/filters-repros";
import { cartesianChartCircles } from "../support/metrics";
import {
  assertQueryBuilderRowCount,
  miniPicker,
  queryBuilderMain,
  visualize,
} from "../support/notebook";
import { ORDERS_BY_YEAR_QUESTION_ID } from "../support/question-saved";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { popover, visitDashboard, visitQuestion } from "../support/ui";
import {
  assertEChartsTooltip,
  cartesianChartCircleWithColor,
  echartsTriggerBlur,
  visitAdhoc,
  visitNativeAdhoc,
} from "../support/viz-charts-repros";

const { ORDERS, ORDERS_ID, PRODUCTS, PRODUCTS_ID, PEOPLE, PEOPLE_ID } =
  SAMPLE_DATABASE;

// TODO: no snowplow-micro container in the spike harness — these mirror the
// H snowplow helpers as no-ops (PORTING.md rule 6).
const resetSnowplow = async () => {};
const enableTracking = async () => {};
const expectNoBadSnowplowEvents = async () => {};
const expectUnstructuredSnowplowEvent = async (_event: unknown) => {};

function waitForDataset(page: import("@playwright/test").Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset",
  );
}

test.describe("scenarios > visualizations > drillthroughs > chart drill", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should allow brush date filter", async ({ page, mb }) => {
    const { id } = await mb.api.createQuestion({
      name: "Brush Date Temporal Filter",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          [
            "field",
            PRODUCTS.CREATED_AT,
            { "source-field": ORDERS.PRODUCT_ID, "temporal-unit": "month" },
          ],
          ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
        ],
      },
      display: "line",
    });
    await visitQuestion(page, id);

    await expect(
      queryBuilderMain(page)
        .getByLabel("Legend")
        .getByText("Gadget", { exact: true }),
    ).toBeVisible();
    await expect(echartsContainer(page)).toContainText("July 2025");
    await expect(echartsContainer(page)).toContainText("January 2026");

    // wait to avoid grabbing the svg before the chart redraws
    await page.waitForTimeout(100);
    // Zoom-in on the left side, which corresponds to July 2025
    await brushChart(page, { startX: 120, endX: 230, y: 200 });

    // Note: mouseup doesn't always happen at the same position; it is enough
    // to assert that the filter exists.
    await expect(page.getByTestId("qb-filters-panel")).toContainText(
      "Product → Created At: Month is",
    );

    // more granular axis labels (cy.contains takes the first of several)
    await expect(
      echartsContainer(page).getByText(/June \d{1,2}, 2025/).first(),
    ).toBeVisible();

    // confirm that product category is still broken out
    const legend = queryBuilderMain(page).getByLabel("Legend");
    await expect(legend.getByText("Gadget", { exact: true })).toBeVisible();
    await expect(legend.getByText("Doohickey", { exact: true })).toBeVisible();
    await expect(legend.getByText("Gizmo", { exact: true })).toBeVisible();
    await expect(legend.getByText("Widget", { exact: true })).toBeVisible();
  });

  for (const granularity of ["month", "month-of-year"] as const) {
    test(`brush filter should work post-aggregation for ${granularity} granularity (metabase#18011)`, async ({
      page,
      mb,
    }) => {
      const { id } = await mb.api.createQuestion({
        name: "18011",
        database: SAMPLE_DB_ID,
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", PRODUCTS.CREATED_AT, { "temporal-unit": granularity }],
            ["field", PRODUCTS.CATEGORY, null],
          ],
        },
        display: "line",
      });
      await visitQuestion(page, id);

      await expect(
        queryBuilderMain(page)
          .getByLabel("Legend")
          .getByText("Gadget", { exact: true }),
      ).toBeVisible();
      await expect(
        echartsContainer(page).getByText(/Count/),
      ).toBeVisible();
      // wait to avoid grabbing the svg before the chart redraws
      await page.waitForTimeout(100);

      const dataset = waitForDataset(page);
      await brushChart(page, { startX: 240, endX: 420, y: 200 });
      await dataset;

      // Once the issue gets fixed, figure out the positive assertion for the
      // "month-of-year" granularity
      if (granularity === "month") {
        await expect(
          page
            .getByTestId("qb-filters-panel")
            .getByText(
              "Created At: Month is Sep 1, 2025, 12:00 AM – Feb 1, 2026, 12:00 AM",
              { exact: true },
            ),
        ).toBeVisible();
      }

      await expect(cartesianChartCircles(page).first()).toBeVisible();
    });
  }

  test("should correctly drill through on a card with multiple series (metabase#11442)", async ({
    page,
    mb,
  }) => {
    const { id: q1Id } = await mb.api.createQuestion({
      name: "11442_Q1",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
      },
      display: "line",
    });
    const { id: q2Id } = await mb.api.createQuestion({
      name: "11442_Q2",
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["count"]],
        breakout: [["field", PRODUCTS.CREATED_AT, { "temporal-unit": "year" }]],
      },
      display: "line",
    });
    const { id: dashboardId } = await mb.api.createDashboard({ name: "11442D" });

    // Add the first question to the dashboard, combined with the second as a
    // series.
    await addOrUpdateDashboardCard(mb.api, {
      card_id: q1Id,
      dashboard_id: dashboardId,
      card: {
        size_x: 21,
        size_y: 12,
        series: [{ id: q2Id, model: "card" }],
      },
    });

    await visitDashboard(page, mb.api, dashboardId);

    // The first series line
    await cartesianChartCircleWithColor(page, "#509EE3").nth(0).click();
    await expect(
      page.getByText("See this year by quarter", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("See these Orders", { exact: true }),
    ).toBeVisible();

    // Click anywhere else to close the first action panel
    await page.getByText("11442D", { exact: true }).click();

    // Second line from the second question
    await cartesianChartCircleWithColor(page, "#98D9D9").nth(0).click();
    await expect(
      page.getByText("See this year by quarter", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("See these Products", { exact: true }),
    ).toBeVisible();
  });

  test("should allow drill-through on combined cards with different amount of series (metabase#13457)", async ({
    page,
    mb,
  }) => {
    const { id: q1Id } = await mb.api.createQuestion({
      name: "13457_Q1",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
      },
      display: "line",
    });
    const { id: q2Id } = await mb.api.createQuestion({
      name: "13457_Q2",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [
          ["avg", ["field", ORDERS.DISCOUNT, null]],
          ["avg", ["field", ORDERS.QUANTITY, null]],
        ],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
      },
      display: "line",
    });
    const { id: dashboardId } = await mb.api.createDashboard({ name: "13457D" });

    await addOrUpdateDashboardCard(mb.api, {
      card_id: q1Id,
      dashboard_id: dashboardId,
      card: {
        size_x: 21,
        size_y: 12,
        series: [{ id: q2Id, model: "card" }],
      },
    });

    await visitDashboard(page, mb.api, dashboardId);

    // The first series line
    await cartesianChartCircleWithColor(page, "#509EE3").nth(0).click();
    await expect(
      page.getByText("See this year by quarter", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("See these Orders", { exact: true }),
    ).toBeVisible();

    // Click anywhere else to close the first action panel
    await page.getByText("13457D", { exact: true }).click();

    // Third series line
    await cartesianChartCircleWithColor(page, "#EF8C8C").nth(0).click();
    await expect(
      page.getByText("See this year by quarter", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("See these Orders", { exact: true }),
    ).toBeVisible();
  });

  test("should drill through a nested query", async ({ page, mb }) => {
    await mb.api.createQuestion({
      name: "CA People",
      query: { "source-table": PEOPLE_ID, limit: 5 },
    });

    // Build a new question off that grouping by City
    await startNewQuestion(page);
    await miniPicker(page).getByText("Our analytics", { exact: true }).click();
    await miniPicker(page).getByText("CA People").click();

    await addSummaryField(page, { metric: "Count of rows" });

    await page.getByText("Pick a column to group by", { exact: true }).click();
    await popover(page).getByText("City", { exact: true }).click();

    await visualize(page);

    await expect(page.getByText("Count by City")).toBeVisible();

    await chartPathWithFillColor(page, "#509EE3").first().click();
    await popover(page).getByText("See this CA Person").click();

    await expect(page.getByText("City is Beaver Dams")).toBeVisible();
    // Scoped to the grid body: the data-grid appends an off-screen measurement
    // clone of its cells to document.body while it sizes columns, so a
    // page-wide getByText intermittently resolves to 2 nodes and toBeVisible()
    // throws a strict-mode violation instead of retrying.
    await expect(
      page.getByTestId("table-body").getByText("Dominique Leffler"),
    ).toBeVisible();
  });

  test("should drill through a with date filter (metabase#12496)", async ({
    page,
    mb,
  }) => {
    await mb.api.createQuestion({
      name: "Orders by Created At: Week",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "week" }]],
      },
      display: "line",
    });

    await page.goto("/collection/root");
    await page
      .getByTestId("collection-entry-name")
      .filter({ hasText: "Orders by Created At: Week" })
      .click();

    await expect(echartsContainer(page).getByText("January 2028")).toBeVisible();

    // drill into a recent week
    const circles = cartesianChartCircles(page);
    await expect.poll(() => circles.count()).toBeGreaterThanOrEqual(4);
    const count = await circles.count();
    await circles.nth(count - 4).click();

    await popover(page).getByText("See these Orders", { exact: true }).click();

    // check that filter is applied and rows displayed
    await assertQueryBuilderRowCount(page, 127);

    // Filter should show the range between two dates (en-dash detects a range)
    await page
      .getByTestId("filter-pill")
      .filter({ hasText: /^Created At: Week is .*–/ })
      .click();
  });

  test("should drill-through on filtered aggregated results (metabase#13504)", async ({
    page,
  }) => {
    await openTable(page, { table: ORDERS_ID, mode: "notebook" });
    await page.getByTestId("action-buttons").locator(".Icon-sum").click();
    await popover(page).getByText("Count of rows", { exact: true }).click();
    await page
      .getByTestId("breakout-step")
      .getByText("Pick a column to group by", { exact: true })
      .click();
    await popover(page).getByText("Created At", { exact: true }).click();
    await page
      .getByTestId("step-summarize-0-0")
      .locator(".Icon-filter")
      .click();
    await popover(page).getByText("Count", { exact: true }).click();
    await popover(page).getByText("Between", { exact: true }).click();
    await popover(page)
      .last()
      .getByText("Greater than", { exact: true })
      .click();
    await popover(page).getByPlaceholder("Enter a number").click();
    await popover(page).getByPlaceholder("Enter a number").fill("1");
    await popover(page).getByRole("button", { name: "Add filter", exact: true }).click();

    await visualize(page);
    await page.getByRole("button", { name: "Visualization", exact: true }).click();
    await leftSidebar(page).getByTestId("more-charts-toggle").click();
    await leftSidebar(page).locator(".Icon-line").click();
    await page.getByRole("button", { name: "Done", exact: true }).click();

    // Mid-point assertion: filter is displaying correctly with the name
    await expect(page.getByTestId("filter-pill")).toContainText(
      "Count is greater than 1",
    );

    // drill-through
    const circles = cartesianChartCircles(page);
    await expect.poll(() => circles.count()).toBeGreaterThanOrEqual(10);
    await circles.nth(10).click();

    await page
      .getByTestId("click-actions-popover")
      .getByText("See these Orders", { exact: true })
      .click();

    // When the bug is present, filter is missing a name (showing only "is 256")
    await assertQueryBuilderRowCount(page, 256);
  });

  test("should display correct value in a tooltip for unaggregated data (metabase#11907)", async ({
    page,
    mb,
  }) => {
    const { id } = await createNativeQuestion(mb.api, {
      name: "11907",
      native: {
        query:
          "SELECT parsedatetime('2026-01-01', 'yyyy-MM-dd') AS \"d\", 5 AS \"c\" UNION ALL\nSELECT parsedatetime('2026-01-01', 'yyyy-MM-dd') AS \"d\", 2 AS \"c\" UNION ALL\nSELECT parsedatetime('2026-01-01', 'yyyy-MM-dd') AS \"d\", 3 AS \"c\" UNION ALL\nSELECT parsedatetime('2026-01-02', 'yyyy-MM-dd') AS \"d\", 1 AS \"c\" UNION ALL\nSELECT parsedatetime('2026-01-02', 'yyyy-MM-dd') AS \"d\", 4 AS \"c\"",
        "template-tags": {},
      },
      display: "line",
    });
    await visitQuestion(page, id);

    await cartesianChartCircles(page).nth(0).hover();
    await assertEChartsTooltip(page, {
      header: "January 1, 2026",
      rows: [{ color: "#EF8C8C", name: "c", value: "10" }],
    });

    await echartsTriggerBlur(page);

    await cartesianChartCircles(page).nth(1).hover();
    await assertEChartsTooltip(page, {
      header: "January 2, 2026",
      rows: [{ color: "#EF8C8C", name: "c", value: "5" }],
    });
  });

  test('should clear the graph.dimensions setting when drilling through on a chart with "graph.dimensions" set (metabase#55484)', async ({
    page,
    mb,
  }) => {
    const { id: questionId } = await mb.api.createQuestion({
      name: "55484",
      display: "line",
      query: {
        "source-table": ORDERS_ID,
        joins: [
          {
            fields: "all",
            "source-table": PRODUCTS_ID,
            condition: [
              "=",
              ["field", ORDERS.PRODUCT_ID, null],
              ["field", PRODUCTS.ID, { "join-alias": "Products" }],
            ],
            alias: "Products",
          },
        ],
        filter: [],
        aggregation: [["count"]],
        breakout: [
          ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "hour" }],
          ["field", ORDERS.CREATED_AT, { "temporal-unit": "hour" }],
        ],
      },
    });

    await page.goto(`/question/${questionId}/notebook`);
    await page.getByRole("button", { name: "Visualize", exact: true }).click();
    await expect
      .poll(() => page.url())
      .toContain(`/question/${questionId}-55484`);
    await page.getByTestId("viz-settings-button").click();
    await (await findByDisplayValue(page.locator("body"), "Created At: Hour")).click();
    await popover(page)
      .getByText("Products → Created At: Hour", { exact: true })
      .click();
    await page.getByRole("button", { name: "Done", exact: true }).click();

    await cartesianChartCircles(page).nth(82).click();
    await popover(page).getByText("See these Orders", { exact: true }).click();

    await expect(page.getByTestId("visualization-root")).toHaveAttribute(
      "data-viz-ui-name",
      "Table",
    );

    await page.getByRole("button", { name: "Visualization", exact: true }).click();
    await leftSidebar(page).getByTestId("more-charts-toggle").click();
    await leftSidebar(page).locator(".Icon-line").click();
    await expect(
      page.getByText("Cannot read properties of undefined (reading 'name')"),
    ).toHaveCount(0);
  });

  test("should display correct value in a tooltip for unaggregated data with breakouts (metabase#15785)", async ({
    page,
  }) => {
    await visitNativeAdhoc(page, {
      dataset_query: {
        type: "native",
        native: {
          query:
            'select 1 as axis, 5 as "VALUE", 9 as breakout union all\nselect 2 as axis, 6 as "VALUE", 10 as breakout union all\nselect 2 as axis, 6 as "VALUE", 10 as breakout',
        },
        database: SAMPLE_DB_ID,
      },
      display: "bar",
      visualization_settings: {
        "graph.dimensions": ["AXIS", "BREAKOUT"],
        "graph.metrics": ["VALUE"],
      },
    });

    await chartPathWithFillColor(page, "#7172AD").first().hover({ force: true });
    await assertEChartsTooltip(page, {
      header: "2",
      rows: [
        { color: "#88BF4D", name: "9", value: "(empty)" },
        { color: "#7172AD", name: "10", value: "12" },
      ],
    });
  });

  test("should drill-through a custom question that joins a native SQL question (metabase#14495)", async ({
    page,
    mb,
  }) => {
    // Restrict "normal user" (belongs to the DATA_GROUP) from writing native
    // queries.
    const graphResponse = await mb.api.get("/api/permissions/graph");
    const { groups, revision } = (await graphResponse.json()) as {
      groups: Record<number, unknown>;
      revision: number;
    };
    groups[DATA_GROUP] = {
      // database_id = 1 (SAMPLE_DATABASE)
      1: { schemas: "all", native: "none" },
    };
    await mb.api.put("/api/permissions/graph", { groups, revision });

    const { id: sqlId } = await createNativeQuestion(mb.api, {
      name: "14495_SQL",
      native: { query: "SELECT * FROM ORDERS", "template-tags": {} },
    });
    const ALIAS = `Question ${sqlId}`;

    // Create a QB question and join it with the previously created native
    // question.
    const { id: questionId } = await mb.api.createQuestion({
      name: "14495",
      query: {
        "source-table": PEOPLE_ID,
        joins: [
          {
            fields: "all",
            "source-table": `card__${sqlId}`,
            condition: [
              "=",
              ["field", PEOPLE.ID, null],
              [
                "field",
                "ID",
                { "base-type": "type/BigInteger", "join-alias": ALIAS },
              ],
            ],
            alias: ALIAS,
          },
        ],
        aggregation: [["count"]],
        breakout: [["field", PEOPLE.CREATED_AT, { "temporal-unit": "month" }]],
      },
      display: "bar",
    });

    // Switch to the normal user who has restricted SQL access
    await mb.signInAsNormalUser();
    await visitQuestion(page, questionId);

    // Initial visualization has rendered and we can now drill-through
    const bars = chartPathWithFillColor(page, "#509EE3");
    await expect.poll(() => bars.count()).toBeGreaterThanOrEqual(4);
    await bars.nth(4).click();

    const dataset = waitForDataset(page);
    await page.getByText("See these People", { exact: true }).click();

    // We should see the resulting dataset of that drill-through
    const response = await dataset;
    const body = await response.json();
    expect(body.error).toBeFalsy();
    await expect(page.getByText("Macy Olson")).toBeVisible();
  });

  test("should parse value on click through on the first row of pie chart (metabase#15250)", async ({
    page,
    mb,
  }) => {
    const { id: questionId } = await mb.api.createQuestion({
      name: "15250",
      query: {
        "source-table": PRODUCTS_ID,
        aggregation: [["count"]],
        breakout: [["field-id", PRODUCTS.CATEGORY]],
      },
      display: "pie",
    });
    const { id: dashboardId } = await mb.api.createDashboard();
    await addOrUpdateDashboardCard(mb.api, {
      card_id: questionId,
      dashboard_id: dashboardId,
      card: {
        size_x: 21,
        size_y: 10,
        visualization_settings: {
          click_behavior: {
            type: "link",
            linkType: "url",
            linkTemplate: "question/{{count}}",
          },
        },
      },
    });

    await visitDashboard(page, mb.api, dashboardId);

    const doohickeyChart = pieSliceWithColor(page, "#88BF4D").first();
    await doohickeyChart.hover({ force: true });

    await assertEChartsTooltip(page, {
      header: "Category",
      rows: [
        { color: "#88BF4D", name: "Doohickey", value: "42" },
        { color: "#F9D45C", name: "Gadget", value: "53" },
        { color: "#A989C5", name: "Gizmo", value: "51" },
        { color: "#F2A86F", name: "Widget", value: "54" },
      ],
    });

    await doohickeyChart.click({ force: true });
    await expect.poll(() => new URL(page.url()).pathname).toBe("/question/42");
  });

  test("should only show the 'See these records' option for the 'Other' pie slice (metabase#5334)", async ({
    page,
  }) => {
    await visitAdhoc(page, {
      name: "5334",
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"]],
          breakout: [["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }]],
        },
        type: "query",
      },
      display: "pie",
      visualization_settings: {
        "pie.dimension": "CATEGORY",
        "pie.metric": "count",
        "pie.slice_threshold": 26,
      },
    });

    // H.pieSlices().filter("[fill^='hsla']") — the "Other" slice is the one
    // whose fill is an hsla() color (the aggregated remainder), unlike the
    // category wedges which use hex colors. pieSlices(page) resolves the same
    // bevel-join wedge paths; scope by the hsla fill prefix directly.
    const otherSlice = echartsContainer(page)
      .locator("path[stroke-linejoin='bevel'][fill^='hsla']")
      .first();
    const box = await otherSlice.boundingBox();
    if (!box) {
      throw new Error("Other pie slice has no bounding box");
    }
    await otherSlice.click({
      position: { x: 30, y: box.height / 2 },
      force: true,
    });

    const clickActionsView = popover(page).getByTestId("click-actions-view");
    await expect(
      clickActionsView.getByText("See these Products", { exact: true }),
    ).toBeVisible();
    await expect(clickActionsView.getByRole("button")).toHaveCount(1);
  });

  test.describe("for an unsaved question", () => {
    test.beforeEach(async ({ page }) => {
      await visitAdhoc(page, {
        dataset_query: {
          database: SAMPLE_DB_ID,
          type: "query",
          query: {
            "source-table": PRODUCTS_ID,
            aggregation: [["count"]],
            breakout: [
              ["field", PRODUCTS.CATEGORY, { "base-type": "type/Text" }],
            ],
          },
        },
      });

      // Drill-through the last bar (Widget)
      await chartPathWithFillColor(page, "#509EE3").last().click();
      await popover(page).getByText("See these Products", { exact: true }).click();
    });

    test("should result in a correct query result", async ({ page }) => {
      // Assert that the URL is correct
      await expect.poll(() => page.url()).toContain("/question#");

      // Assert on the correct product category: Widget
      await expect(
        page
          .getByTestId("qb-filters-panel")
          .getByText("Category is Widget", { exact: true }),
      ).toBeVisible();

      await expect(page.getByTestId("question-row-count")).toHaveText(
        "Showing 54 rows",
      );

      const vizRoot = page.getByTestId("visualization-root");
      await expect(vizRoot).toContainText("Widget");
      await expect(vizRoot).not.toContainText("Gizmo");
      await expect(vizRoot).not.toContainText("Doohickey");
    });
  });

  test("should display proper drills on chart click for line chart", async ({
    page,
    mb,
  }) => {
    const { id } = await mb.api.createQuestion({
      name: "Line chart drills",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          [
            "field",
            PRODUCTS.CREATED_AT,
            { "source-field": ORDERS.PRODUCT_ID, "temporal-unit": "month" },
          ],
          ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
        ],
      },
      display: "line",
    });
    await visitQuestion(page, id);

    await cartesianChartCircles(page).nth(2).click();
    const drills = popover(page);
    await expect(
      drills.getByText("See these Orders", { exact: true }),
    ).toBeVisible();
    await expect(
      drills.getByText("See this month by week", { exact: true }),
    ).toBeVisible();
    await expect(drills.getByText("Break out by…", { exact: true })).toBeVisible();
    await expect(
      drills.getByText("Automatic insights…", { exact: true }),
    ).toBeVisible();
    await expect(drills.getByText(">", { exact: true })).toBeVisible();
    await expect(drills.getByText("<", { exact: true })).toBeVisible();
    await expect(drills.getByText("=", { exact: true })).toBeVisible();
    await expect(drills.getByText("≠", { exact: true })).toBeVisible();

    const chrome = page.getByTestId("timeseries-chrome");
    await expect(chrome.getByText("View", { exact: true })).toBeVisible();
    await expect(chrome.getByText("All time", { exact: true })).toBeVisible();
    await expect(chrome.getByText("by", { exact: true })).toBeVisible();
    await expect(chrome.getByText("Month", { exact: true })).toBeVisible();
  });

  test("should display proper drills on chart click for bar chart", async ({
    page,
    mb,
  }) => {
    const { id } = await mb.api.createQuestion({
      name: "Line chart drills",
      query: {
        "source-table": ORDERS_ID,
        aggregation: [["count"]],
        breakout: [
          [
            "field",
            PRODUCTS.CREATED_AT,
            { "source-field": ORDERS.PRODUCT_ID, "temporal-unit": "month" },
          ],
          ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
        ],
      },
      display: "bar",
    });
    await visitQuestion(page, id);

    await page.getByTestId("legend-item").first().click();

    const legendDrills = popover(page);
    await expect(
      legendDrills.getByText("See these Orders", { exact: true }),
    ).toBeVisible();
    await expect(
      legendDrills.getByText("Automatic insights…", { exact: true }),
    ).toBeVisible();

    // Close the legend drill popover before clicking a bar. Cypress's synthetic
    // click reaches the SVG bar even with the popover open; Playwright's real
    // click on the bar only dismisses the open popover and never opens the bar
    // drill, so dismiss it first.
    await page.keyboard.press("Escape");
    await expect(legendDrills).toHaveCount(0);

    await chartPathWithFillColor(page, "#A989C5").first().click();
    const drills = popover(page);
    await expect(
      drills.getByText("See these Orders", { exact: true }),
    ).toBeVisible();
    await expect(
      drills.getByText("See this month by week", { exact: true }),
    ).toBeVisible();
    await expect(drills.getByText("Break out by…", { exact: true })).toBeVisible();
    await expect(
      drills.getByText("Automatic insights…", { exact: true }),
    ).toBeVisible();
    await expect(drills.getByText(">", { exact: true })).toBeVisible();
    await expect(drills.getByText("<", { exact: true })).toBeVisible();
    await expect(drills.getByText("=", { exact: true })).toBeVisible();
    await expect(drills.getByText("≠", { exact: true })).toBeVisible();

    const chrome = page.getByTestId("timeseries-chrome");
    await expect(chrome.getByText("View", { exact: true })).toBeVisible();
    await expect(chrome.getByText("All time", { exact: true })).toBeVisible();
    await expect(chrome.getByText("by", { exact: true })).toBeVisible();
    await expect(chrome.getByText("Month", { exact: true })).toBeVisible();
  });

  test("should display proper drills on chart click for query grouped by state", async ({
    page,
    mb,
  }) => {
    const { id } = await mb.api.createQuestion({
      name: "Line chart drills",
      query: {
        "source-table": PEOPLE_ID,
        aggregation: [["count"]],
        breakout: [["field", PEOPLE.STATE, null]],
      },
      display: "map",
    });
    await visitQuestion(page, id);

    await page.getByTestId("choropleth-feature").first().click();

    const content = page.getByTestId(
      "click-actions-popover-content-for-Count",
    );
    await expect(
      content.getByText("See these People", { exact: true }),
    ).toBeVisible();
    await expect(
      content.getByText("Zoom in: State", { exact: true }),
    ).toBeVisible();
    await expect(content.getByText("Break out by…", { exact: true })).toBeVisible();
    await expect(
      content.getByText("Automatic insights…", { exact: true }),
    ).toBeVisible();
    await expect(content.getByText(">", { exact: true })).toBeVisible();
    await expect(content.getByText("<", { exact: true })).toBeVisible();
    await expect(content.getByText("=", { exact: true })).toBeVisible();
    await expect(content.getByText("≠", { exact: true })).toBeVisible();
  });

  test.describe("chart click actions analytics", () => {
    test.beforeEach(async ({ mb }) => {
      await resetSnowplow();
      await mb.restore();
      await mb.signInAsAdmin();
      await enableTracking();
    });

    test.afterEach(async () => {
      await expectNoBadSnowplowEvents();
    });

    // This list is not exhaustive. It only covers the events that were defined
    // in a ticket defined by Product. The full list can be found in
    // frontend/src/metabase/visualizations/types/click-actions.ts
    test("should track clicks on action sections", async ({ page }) => {
      await visitQuestion(page, ORDERS_BY_YEAR_QUESTION_ID);

      const circle = () => cartesianChartCircles(page).nth(1);

      await expect(circle()).toBeVisible();
      await circle().click();
      await popover(page)
        .getByText(/^See these/)
        .click();
      await expectUnstructuredSnowplowEvent({
        event: "click_action",
        triggered_from: "records",
      });

      await page.goBack();
      await expect(circle()).toBeVisible();
      await circle().click();
      await popover(page)
        .getByText(/^See this year/)
        .click();
      await expectUnstructuredSnowplowEvent({
        event: "click_action",
        triggered_from: "zoom",
      });

      await expect(circle()).toBeVisible();
      await circle().click();
      await popover(page)
        .getByText(/^Break out by/)
        .click();
      await expectUnstructuredSnowplowEvent({
        event: "click_action",
        triggered_from: "breakout",
      });

      await expect(circle()).toBeVisible();
      await circle().click();
      await popover(page).getByText(">", { exact: true }).click();
      await expectUnstructuredSnowplowEvent({
        event: "click_action",
        triggered_from: "filter",
      });

      await page.goBack();

      await expect(circle()).toBeVisible();
      await circle().click();
      await popover(page)
        .getByText(/^Automatic insights/)
        .click();
      await expectUnstructuredSnowplowEvent({
        event: "click_action",
        triggered_from: "auto",
      });

      await popover(page).getByText("X-ray", { exact: true }).click();
      await expectUnstructuredSnowplowEvent({
        event: "x-ray_automatic_insights_clicked",
        event_detail: "x-ray",
      });

      await page.goBack();

      await expect(circle()).toBeVisible();
      await circle().click();
      await popover(page)
        .getByText(/^Automatic insights/)
        .click();
      await popover(page).getByText("Compare to the rest", { exact: true }).click();
      await expectUnstructuredSnowplowEvent({
        event: "x-ray_automatic_insights_clicked",
        event_detail: "compare_to_rest",
      });
    });
  });
});
