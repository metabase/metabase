/**
 * Playwright port of
 * e2e/test/scenarios/visualizations-charts/legend.cy.spec.js
 *
 * New helpers live in support/legend.ts (scoped chart-locator forms +
 * scatterBubbleWithColor + the spec-local hide/show/legend-percentage helpers);
 * assertEChartsTooltip is imported read-only from viz-charts-repros.ts.
 *
 * Scoping note: the dashboard test asserts on charts inside a specific dashcard
 * (Cypress `H.getDashboardCard(n).within(...)`). Playwright locators are
 * absolute, so every chart-locator helper here takes an explicit scope (the
 * dashcard / modal / popover Locator, or the page for the single-chart tests).
 */
import type { Locator } from "@playwright/test";

import { editDashboard, getDashboardCard, modal } from "../support/dashboard";
import { createDashboardWithQuestions } from "../support/factories";
import { test, expect } from "../support/fixtures";
import {
  chartPathWithFillColor,
  echartsText,
  hideSeries,
  pieChartLegendItemPercentage,
  pieSlices,
  scatterBubbleWithColor,
  showSeries,
  trendLine,
} from "../support/legend";
import { ensureChartIsActive } from "../support/metrics-explorer";
import { visitPublicDashboard } from "../support/question-saved";
import { SAMPLE_DATABASE } from "../support/sample-data";
import { popover, visitDashboard } from "../support/ui";
import { openVizSettingsSidebar, leftSidebar } from "../support/charts";
import { showDashcardVisualizerModal } from "../support/visualizer-basics";
import { assertEChartsTooltip } from "../support/viz-charts-repros";

const { ORDERS, ORDERS_ID, PEOPLE, PRODUCTS } = SAMPLE_DATABASE;

const ORDERS_CREATED_AT_FIELD_REF = [
  "field",
  ORDERS.CREATED_AT,
  { "temporal-unit": "year", "base-type": "type/DateTime" },
];

const JOINED_PRODUCT_CATEGORY_FIELD_REF = [
  "field",
  PRODUCTS.CATEGORY,
  { "source-field": ORDERS.PRODUCT_ID, "base-type": "type/Text" },
];

const JOINED_PEOPLE_STATE_FIELD_REF = [
  "field",
  PEOPLE.STATE,
  { "source-field": ORDERS.USER_ID, "base-type": "type/Text" },
];

const CATEGORY_COLOR = {
  DOOHICKEY: "#88BF4D",
  GADGET: "#F9D45C",
  GIZMO: "#A989C5",
  WIDGET: "#F2A86F",
};

const SINGLE_AGGREGATION_QUESTION = {
  name: "single aggregation series",
  display: "bar",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [ORDERS_CREATED_AT_FIELD_REF, JOINED_PRODUCT_CATEGORY_FIELD_REF],
  },
};

const MANY_LEGEND_ITEMS_QUESTION = {
  name: "vertical legend with popover",
  display: "line",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [ORDERS_CREATED_AT_FIELD_REF, JOINED_PEOPLE_STATE_FIELD_REF],
  },
  visualization_settings: {
    "graph.dimensions": ["CREATED_AT", "STATE"],
    "graph.metrics": ["count"],
  },
};

const PIE_CHART_QUESTION = {
  name: "pie chart",
  display: "pie",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [JOINED_PEOPLE_STATE_FIELD_REF],
  },
  visualization_settings: {
    "pie.slice_threshold": 4,
  },
};

const SPLIT_AXIS_QUESTION = {
  name: "two aggregations + split axis + trendline",
  display: "combo",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [
      ["sum", ["field", ORDERS.TOTAL, { "base-type": "type/Float" }]],
      ["sum", ["field", ORDERS.QUANTITY, { "base-type": "type/Integer" }]],
    ],
    breakout: [ORDERS_CREATED_AT_FIELD_REF],
  },
  visualization_settings: {
    "graph.show_trendline": true,
  },
};

const SCATTER_VIZ_QUESTION = {
  name: "scatter",
  display: "scatter",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [
      ["count"],
      ["distinct", ["field", PRODUCTS.ID, { "source-field": ORDERS.PRODUCT_ID }]],
    ],
    breakout: [ORDERS_CREATED_AT_FIELD_REF, JOINED_PRODUCT_CATEGORY_FIELD_REF],
  },
  visualization_settings: {
    "graph.dimensions": ["count", "CATEGORY"],
    "graph.metrics": ["count_2"],
  },
};

test.describe("scenarios > visualizations > legend", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should toggle series visibility on a dashboard", async ({
    page,
    mb,
  }) => {
    const { dashboard } = await createDashboardWithQuestions(mb.api, {
      questions: [
        SINGLE_AGGREGATION_QUESTION,
        MANY_LEGEND_ITEMS_QUESTION,
        SPLIT_AXIS_QUESTION,
        SCATTER_VIZ_QUESTION,
        PIE_CHART_QUESTION,
      ],
      cards: [
        { col: 0, row: 0, size_x: 24, size_y: 6 },
        { col: 0, row: 6, size_x: 24, size_y: 6 },
        { col: 0, row: 12, size_x: 24, size_y: 6 },
        { col: 0, row: 18, size_x: 24, size_y: 6 },
        { col: 0, row: 24, size_x: 24, size_y: 5 },
      ],
    });
    await visitDashboard(page, mb.api, dashboard.id);

    const card0 = getDashboardCard(page, 0);

    await chartPathWithFillColor(card0, CATEGORY_COLOR.DOOHICKEY).first().hover();
    await assertEChartsTooltip(page, {
      header: "2025",
      rows: [
        { name: "Doohickey", value: "177" },
        { name: "Gadget", value: "199" },
        { name: "Gizmo", value: "158" },
        { name: "Widget", value: "210" },
      ],
    });

    await expect(
      chartPathWithFillColor(card0, CATEGORY_COLOR.DOOHICKEY),
    ).toHaveCount(5);
    await expect(chartPathWithFillColor(card0, CATEGORY_COLOR.GADGET)).toHaveCount(
      5,
    );
    await expect(chartPathWithFillColor(card0, CATEGORY_COLOR.GIZMO)).toHaveCount(
      5,
    );
    await expect(chartPathWithFillColor(card0, CATEGORY_COLOR.WIDGET)).toHaveCount(
      5,
    );

    await expect(echartsText(card0, "Count").first()).toBeVisible(); // y-axis label
    await expect(echartsText(card0, "Created At: Year").first()).toBeVisible(); // x-axis label
    // some y-axis values
    await expect(echartsText(card0, "1,800").first()).toBeVisible();
    await expect(echartsText(card0, "1,500").first()).toBeVisible();
    await expect(echartsText(card0, "1,200").first()).toBeVisible();

    await hideSeries(card0, 1); // Gadget
    await expect(
      chartPathWithFillColor(card0, CATEGORY_COLOR.DOOHICKEY),
    ).toHaveCount(5);
    await expect(chartPathWithFillColor(card0, CATEGORY_COLOR.GADGET)).toHaveCount(
      0,
    );
    await expect(chartPathWithFillColor(card0, CATEGORY_COLOR.GIZMO)).toHaveCount(
      5,
    );
    await expect(chartPathWithFillColor(card0, CATEGORY_COLOR.WIDGET)).toHaveCount(
      5,
    );

    await hideSeries(card0, 2); // Gizmo
    await expect(
      chartPathWithFillColor(card0, CATEGORY_COLOR.DOOHICKEY),
    ).toHaveCount(5);
    await expect(chartPathWithFillColor(card0, CATEGORY_COLOR.GADGET)).toHaveCount(
      0,
    );
    await expect(chartPathWithFillColor(card0, CATEGORY_COLOR.GIZMO)).toHaveCount(
      0,
    );
    await expect(chartPathWithFillColor(card0, CATEGORY_COLOR.WIDGET)).toHaveCount(
      5,
    );

    await chartPathWithFillColor(card0, CATEGORY_COLOR.DOOHICKEY).first().hover();
    await assertEChartsTooltip(page, {
      header: "2025",
      rows: [
        { name: "Doohickey", value: "177" },
        { name: "Widget", value: "210" },
      ],
    });

    await hideSeries(card0, 3); // Widget
    await expect(
      chartPathWithFillColor(card0, CATEGORY_COLOR.DOOHICKEY),
    ).toHaveCount(5);
    await expect(chartPathWithFillColor(card0, CATEGORY_COLOR.GADGET)).toHaveCount(
      0,
    );
    await expect(chartPathWithFillColor(card0, CATEGORY_COLOR.GIZMO)).toHaveCount(
      0,
    );
    await expect(chartPathWithFillColor(card0, CATEGORY_COLOR.WIDGET)).toHaveCount(
      0,
    );

    await hideSeries(card0, 0);
    // Ensure can't hide the last visible series
    await expect(
      chartPathWithFillColor(card0, CATEGORY_COLOR.DOOHICKEY),
    ).toHaveCount(5);
    await expect(chartPathWithFillColor(card0, CATEGORY_COLOR.GADGET)).toHaveCount(
      0,
    );
    await expect(chartPathWithFillColor(card0, CATEGORY_COLOR.GIZMO)).toHaveCount(
      0,
    );
    await expect(chartPathWithFillColor(card0, CATEGORY_COLOR.WIDGET)).toHaveCount(
      0,
    );

    await expect(echartsText(card0, "Count").first()).toBeVisible(); // y-axis label
    await expect(echartsText(card0, "Created At: Year").first()).toBeVisible(); // x-axis label
    // Ensure y-axis adjusts to visible series range
    await expect(echartsText(card0, "1,800")).toHaveCount(0);
    await expect(echartsText(card0, "1,500").first()).toBeVisible();
    await expect(echartsText(card0, "1,200").first()).toBeVisible();

    await showSeries(card0, 1);
    await expect(
      chartPathWithFillColor(card0, CATEGORY_COLOR.DOOHICKEY),
    ).toHaveCount(5);
    await expect(chartPathWithFillColor(card0, CATEGORY_COLOR.GADGET)).toHaveCount(
      5,
    );
    await expect(chartPathWithFillColor(card0, CATEGORY_COLOR.GIZMO)).toHaveCount(
      0,
    );
    await expect(chartPathWithFillColor(card0, CATEGORY_COLOR.WIDGET)).toHaveCount(
      0,
    );

    await expect(echartsText(card0, "Count").first()).toBeVisible(); // y-axis label
    await expect(echartsText(card0, "Created At: Year").first()).toBeVisible(); // x-axis label
    await expect(echartsText(card0, "1,800").first()).toBeVisible();
    await expect(echartsText(card0, "1,500").first()).toBeVisible();
    await expect(echartsText(card0, "1,200").first()).toBeVisible();

    await showSeries(card0, 2);
    await showSeries(card0, 3);

    const card1 = getDashboardCard(page, 1);
    await expect(echartsText(card1, "500").first()).toBeVisible(); // max y-axis value
    await card1.getByText("And 39 more", { exact: true }).click();
    await hideSeries(popover(page), 29); // TX (Texas)
    await card1.click(); // click outside of popover to close it
    await expect(echartsText(card1, "500")).toHaveCount(0);

    const card2 = getDashboardCard(page, 2);
    // left axis
    await expect(echartsText(card2, "Sum of Total").first()).toBeVisible();
    await expect(echartsText(card2, "600,000").first()).toBeVisible();
    // right axis
    await expect(echartsText(card2, "Sum of Quantity").first()).toBeVisible();
    await expect(echartsText(card2, "30,000").first()).toBeVisible();
    await expect(trendLine(card2)).toHaveCount(2);

    await hideSeries(card2, 0); // Sum of Total

    // left axis
    await expect(echartsText(card2, "Sum of Total")).toHaveCount(0);
    await expect(echartsText(card2, "600,000")).toHaveCount(0);
    // right axis
    await expect(echartsText(card2, "Sum of Quantity").first()).toBeVisible();
    await expect(echartsText(card2, "30,000").first()).toBeVisible();
    await expect(trendLine(card2)).toHaveCount(1);

    await showSeries(card2, 0);
    await hideSeries(card2, 1);

    // left axis
    await expect(echartsText(card2, "Sum of Total").first()).toBeVisible();
    await expect(echartsText(card2, "600,000").first()).toBeVisible();
    // right axis
    await expect(echartsText(card2, "Sum of Quantity")).toHaveCount(0);
    await expect(echartsText(card2, "30,000")).toHaveCount(0);
    await expect(trendLine(card2)).toHaveCount(1);

    const card3 = getDashboardCard(page, 3);
    await expect(
      scatterBubbleWithColor(card3, CATEGORY_COLOR.DOOHICKEY),
    ).toHaveCount(5);
    await expect(
      scatterBubbleWithColor(card3, CATEGORY_COLOR.GADGET),
    ).toHaveCount(5);
    await expect(scatterBubbleWithColor(card3, CATEGORY_COLOR.GIZMO)).toHaveCount(
      5,
    );
    await expect(
      scatterBubbleWithColor(card3, CATEGORY_COLOR.WIDGET),
    ).toHaveCount(5);

    await expect(echartsText(card3, "54").first()).toBeVisible(); // max y-axis value

    await hideSeries(card3, 1); // Gadget
    await hideSeries(card3, 2); // Gizmo
    await hideSeries(card3, 3); // Widget

    await expect(
      scatterBubbleWithColor(card3, CATEGORY_COLOR.DOOHICKEY),
    ).toHaveCount(5);
    await expect(
      scatterBubbleWithColor(card3, CATEGORY_COLOR.GADGET),
    ).toHaveCount(0);
    await expect(scatterBubbleWithColor(card3, CATEGORY_COLOR.GIZMO)).toHaveCount(
      0,
    );
    await expect(
      scatterBubbleWithColor(card3, CATEGORY_COLOR.WIDGET),
    ).toHaveCount(0);

    await expect(echartsText(card3, "54")).toHaveCount(0); // old max y-axis value
    await expect(echartsText(card3, "42").first()).toBeVisible(); // new max y-axis value

    const card4 = getDashboardCard(page, 4);
    await expect(card4.getByText("18,760", { exact: true })).toBeVisible(); // total value
    await expect(pieSlices(card4)).toHaveCount(4);
    await expect(pieChartLegendItemPercentage(card4, "TX")).toHaveText("7.15%");

    await hideSeries(card4, 0); // TX (Texas)

    await expect(pieSlices(card4)).toHaveCount(3);
    await expect(card4.getByText("18,760", { exact: true })).toHaveCount(0);
    await expect(card4.getByText("17,418", { exact: true })).toBeVisible();
    await expect(pieChartLegendItemPercentage(card4, "TX")).toHaveText("");

    await hideSeries(card4, 3); // "Other" slice

    await expect(pieSlices(card4)).toHaveCount(2);
    await expect(card4.getByText("17,418", { exact: true })).toHaveCount(0);
    await expect(card4.getByText("1,660", { exact: true })).toBeVisible();
    await expect(pieChartLegendItemPercentage(card4, "Other")).toHaveText("");
    await expect(pieChartLegendItemPercentage(card4, "MT")).toHaveText("52.5%");
    await expect(pieChartLegendItemPercentage(card4, "MN")).toHaveText("47.5%");

    await showSeries(card4, 0);

    await expect(pieSlices(card4)).toHaveCount(3);
    await expect(pieChartLegendItemPercentage(card4, "TX")).toHaveText("44.7%");

    // Ensure can't toggle series visibility in edit mode
    await editDashboard(page);

    await showDashcardVisualizerModal(page, 0, { isVisualizerCard: false });

    const dialog = modal(page);
    await ensureCanNotToggleSeriesVisibility(dialog);
    await page.keyboard.press("Escape");
  });

  test("should toggle series visibility on a public dashboard", async ({
    page,
    mb,
  }) => {
    const { dashboard } = await createDashboardWithQuestions(mb.api, {
      questions: [SINGLE_AGGREGATION_QUESTION],
      cards: [{ col: 0, row: 0, size_x: 24, size_y: 6 }],
    });
    await visitPublicDashboard(page, mb, dashboard.id);

    await expect(chartPathWithFillColor(page, CATEGORY_COLOR.DOOHICKEY)).toHaveCount(
      5,
    );
    await expect(chartPathWithFillColor(page, CATEGORY_COLOR.GADGET)).toHaveCount(
      5,
    );
    await expect(chartPathWithFillColor(page, CATEGORY_COLOR.GIZMO)).toHaveCount(5);
    await expect(chartPathWithFillColor(page, CATEGORY_COLOR.WIDGET)).toHaveCount(
      5,
    );

    await expect(echartsText(page, "Count").first()).toBeVisible(); // y-axis label
    await expect(echartsText(page, "Created At: Year").first()).toBeVisible(); // x-axis label
    // some y-axis values
    await expect(echartsText(page, "1,800").first()).toBeVisible();
    await expect(echartsText(page, "1,500").first()).toBeVisible();
    await expect(echartsText(page, "1,200").first()).toBeVisible();

    await hideSeries(page, 1); // Gadget
    await expect(chartPathWithFillColor(page, CATEGORY_COLOR.DOOHICKEY)).toHaveCount(
      5,
    );
    await expect(chartPathWithFillColor(page, CATEGORY_COLOR.GADGET)).toHaveCount(
      0,
    );
    await expect(chartPathWithFillColor(page, CATEGORY_COLOR.GIZMO)).toHaveCount(5);
    await expect(chartPathWithFillColor(page, CATEGORY_COLOR.WIDGET)).toHaveCount(
      5,
    );
  });

  test("should toggle series visibility in the query builder", async ({
    page,
    mb,
  }) => {
    const { id } = await mb.api.createQuestion(SINGLE_AGGREGATION_QUESTION);
    await page.goto(`/question/${id}`);

    await expect(chartPathWithFillColor(page, CATEGORY_COLOR.DOOHICKEY)).toHaveCount(
      5,
    );
    await expect(chartPathWithFillColor(page, CATEGORY_COLOR.GADGET)).toHaveCount(
      5,
    );
    await expect(chartPathWithFillColor(page, CATEGORY_COLOR.GIZMO)).toHaveCount(5);
    await expect(chartPathWithFillColor(page, CATEGORY_COLOR.WIDGET)).toHaveCount(
      5,
    );

    await chartPathWithFillColor(page, CATEGORY_COLOR.DOOHICKEY).first().hover();
    await assertEChartsTooltip(page, {
      header: "2025",
      rows: [
        { name: "Doohickey", value: "177" },
        { name: "Gadget", value: "199" },
        { name: "Gizmo", value: "158" },
        { name: "Widget", value: "210" },
      ],
    });

    await expect(echartsText(page, "Count").first()).toBeVisible(); // y-axis label
    await expect(echartsText(page, "Created At: Year").first()).toBeVisible(); // x-axis label
    // some y-axis values
    await expect(echartsText(page, "1,800").first()).toBeVisible();
    await expect(echartsText(page, "1,500").first()).toBeVisible();
    await expect(echartsText(page, "1,200").first()).toBeVisible();

    await hideSeries(page, 1); // Gadget
    await expect(chartPathWithFillColor(page, CATEGORY_COLOR.DOOHICKEY)).toHaveCount(
      5,
    );
    await expect(chartPathWithFillColor(page, CATEGORY_COLOR.GADGET)).toHaveCount(
      0,
    );
    await expect(chartPathWithFillColor(page, CATEGORY_COLOR.GIZMO)).toHaveCount(5);
    await expect(chartPathWithFillColor(page, CATEGORY_COLOR.WIDGET)).toHaveCount(
      5,
    );

    await hideSeries(page, 2); // Gizmo
    await expect(chartPathWithFillColor(page, CATEGORY_COLOR.DOOHICKEY)).toHaveCount(
      5,
    );
    await expect(chartPathWithFillColor(page, CATEGORY_COLOR.GADGET)).toHaveCount(
      0,
    );
    await expect(chartPathWithFillColor(page, CATEGORY_COLOR.GIZMO)).toHaveCount(0);
    await expect(chartPathWithFillColor(page, CATEGORY_COLOR.WIDGET)).toHaveCount(
      5,
    );

    await chartPathWithFillColor(page, CATEGORY_COLOR.DOOHICKEY).first().hover();
    await assertEChartsTooltip(page, {
      header: "2025",
      rows: [
        { name: "Doohickey", value: "177" },
        { name: "Widget", value: "210" },
      ],
      blurAfter: true,
    });

    await hideSeries(page, 3); // Widget
    await expect(chartPathWithFillColor(page, CATEGORY_COLOR.DOOHICKEY)).toHaveCount(
      5,
    );
    await expect(chartPathWithFillColor(page, CATEGORY_COLOR.GADGET)).toHaveCount(
      0,
    );
    await expect(chartPathWithFillColor(page, CATEGORY_COLOR.GIZMO)).toHaveCount(0);
    await expect(chartPathWithFillColor(page, CATEGORY_COLOR.WIDGET)).toHaveCount(
      0,
    );

    await hideSeries(page, 0);
    // Ensure can't hide the last visible series
    await expect(chartPathWithFillColor(page, CATEGORY_COLOR.DOOHICKEY)).toHaveCount(
      5,
    );
    await expect(chartPathWithFillColor(page, CATEGORY_COLOR.GADGET)).toHaveCount(
      0,
    );
    await expect(chartPathWithFillColor(page, CATEGORY_COLOR.GIZMO)).toHaveCount(0);
    await expect(chartPathWithFillColor(page, CATEGORY_COLOR.WIDGET)).toHaveCount(
      0,
    );

    await expect(echartsText(page, "Count").first()).toBeVisible(); // y-axis label
    await expect(echartsText(page, "Created At: Year").first()).toBeVisible(); // x-axis label
    // Ensure y-axis adjusts to visible series range
    await expect(echartsText(page, "1,800")).toHaveCount(0);
    await expect(echartsText(page, "1,500").first()).toBeVisible();
    await expect(echartsText(page, "1,200").first()).toBeVisible();

    await showSeries(page, 1);
    await expect(chartPathWithFillColor(page, CATEGORY_COLOR.DOOHICKEY)).toHaveCount(
      5,
    );
    await expect(chartPathWithFillColor(page, CATEGORY_COLOR.GADGET)).toHaveCount(
      5,
    );
    await expect(chartPathWithFillColor(page, CATEGORY_COLOR.GIZMO)).toHaveCount(0);
    await expect(chartPathWithFillColor(page, CATEGORY_COLOR.WIDGET)).toHaveCount(
      0,
    );

    await expect(echartsText(page, "Count").first()).toBeVisible(); // y-axis label
    await expect(echartsText(page, "Created At: Year").first()).toBeVisible(); // x-axis label
    await expect(echartsText(page, "1,800").first()).toBeVisible();
    await expect(echartsText(page, "1,500").first()).toBeVisible();
    await expect(echartsText(page, "1,200").first()).toBeVisible();

    await showSeries(page, 2);
    await showSeries(page, 3);

    await openVizSettingsSidebar(page);
    await ensureChartIsActive(page);

    await leftSidebar(page).getByText("Display", { exact: true }).click();
    await leftSidebar(page).getByText("Stack - 100%", { exact: true }).click();

    await page.waitForTimeout(1000);

    await chartPathWithFillColor(page, CATEGORY_COLOR.DOOHICKEY).first().hover();
    await assertEChartsTooltip(page, {
      header: "2025",
      rows: [
        { name: "Doohickey", value: "177", secondaryValue: "23.79 %" },
        { name: "Gadget", value: "199", secondaryValue: "26.75 %" },
        { name: "Gizmo", value: "158", secondaryValue: "21.24 %" },
        { name: "Widget", value: "210", secondaryValue: "28.23 %" },
      ],
      footer: { name: "Total", value: "744", secondaryValue: "100 %" },
      blurAfter: true,
    });

    await hideSeries(page, 2); // Gizmo
    await hideSeries(page, 3); // Widget

    await chartPathWithFillColor(page, CATEGORY_COLOR.DOOHICKEY).first().hover();
    await assertEChartsTooltip(page, {
      header: "2025",
      rows: [
        { name: "Doohickey", value: "177", secondaryValue: "47.07 %" },
        { name: "Gadget", value: "199", secondaryValue: "52.93 %" },
      ],
      footer: { name: "Total", value: "376", secondaryValue: "100 %" },
      blurAfter: true,
    });
  });
});

/**
 * Port of the spec-local ensureCanNotToggleSeriesVisibility: in the visualizer
 * modal / edit mode the "Hide series" control is absent and clicking the legend
 * dot does nothing. `scope` is the modal Locator.
 */
async function ensureCanNotToggleSeriesVisibility(scope: Locator) {
  const legendItem = scope.getByTestId("legend-item").nth(0);

  await expect(legendItem.getByLabel("Hide series", { exact: true })).toHaveCount(
    0,
  );
  await legendItem.getByTestId("legend-item-dot").click({ force: true });

  await expect(
    chartPathWithFillColor(scope, CATEGORY_COLOR.DOOHICKEY),
  ).toHaveCount(5);
  await expect(chartPathWithFillColor(scope, CATEGORY_COLOR.GADGET)).toHaveCount(
    5,
  );
  await expect(chartPathWithFillColor(scope, CATEGORY_COLOR.GIZMO)).toHaveCount(5);
  await expect(chartPathWithFillColor(scope, CATEGORY_COLOR.WIDGET)).toHaveCount(
    5,
  );
}
