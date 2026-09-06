/**
 * Playwright port of
 * e2e/test/scenarios/visualizations-charts/scatter.cy.spec.js
 *
 * New helper lives in support/scatter.ts (the spec-local
 * triggerPopoverForBubble). Everything else is imported read-only:
 *  - cartesianChartCircles (metrics.ts) — H.cartesianChartCircle() is
 *    cartesianChartCircles().should("be.visible"); the visibility gate is
 *    supplied at each call site (hover's actionability / boundingBox).
 *  - visitAdhoc / visitNativeAdhoc / assertEChartsTooltip (viz-charts-repros.ts)
 *  - assertEChartsTooltipNotContain (waterfall.ts)
 *  - openVizSettingsSidebar / leftSidebar (charts.ts)
 *
 * Scatter bubbles are the same SVG <path d="M1 0A1 1 0 1 1 1 -0.0001"> markers
 * as line/area circles, so cartesianChartCircles resolves them.
 */
import { test, expect } from "../support/fixtures";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import { cartesianChartCircles } from "../support/metrics";
import { openVizSettingsSidebar, leftSidebar } from "../support/charts";
import { assertEChartsTooltipNotContain } from "../support/waterfall";
import {
  visitAdhoc,
  visitNativeAdhoc,
  assertEChartsTooltip,
  echartsTooltip,
} from "../support/viz-charts-repros";
import { triggerPopoverForBubble } from "../support/scatter";

const { ORDERS, ORDERS_ID, PRODUCTS } = SAMPLE_DATABASE;

const testQuery = {
  database: SAMPLE_DB_ID,
  query: {
    "source-table": ORDERS_ID,
    aggregation: [
      ["count"],
      ["distinct", ["field", PRODUCTS.ID, { "source-field": ORDERS.PRODUCT_ID }]],
    ],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
  },
  type: "query" as const,
};

const testQueryBreakout = {
  database: SAMPLE_DB_ID,
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
      ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
      ["field", PRODUCTS.RATING, null],
    ],
  },
  type: "query" as const,
};

test.describe("scenarios > visualizations > scatter", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();
  });

  test("should show correct labels in tooltip (metabase#15150)", async ({
    page,
  }) => {
    await visitAdhoc(page, {
      dataset_query: testQuery,
      display: "scatter",
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["count", "count_2"],
      },
    });

    await triggerPopoverForBubble(page);
    await assertEChartsTooltip(page, {
      header: "May 2026",
      rows: [
        { name: "Count", value: "271" },
        { name: "Distinct values of Product → ID", value: "137" },
      ],
    });
  });

  test("should show correct labels in tooltip when display name has manually set (metabase#11395)", async ({
    page,
  }) => {
    await visitAdhoc(page, {
      dataset_query: testQuery,
      display: "scatter",
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["count", "count_2"],
        series_settings: {
          count: { title: "Orders count" },
          count_2: { title: "Products count" },
        },
      },
    });

    await triggerPopoverForBubble(page);
    await assertEChartsTooltip(page, {
      header: "May 2026",
      rows: [
        { name: "Orders count", value: "271" },
        { name: "Products count", value: "137" },
      ],
    });
  });

  test("should not show non-hovered breakout series in the tooltip (metabase#50630)", async ({
    page,
  }) => {
    await visitAdhoc(page, {
      dataset_query: testQueryBreakout,
      display: "scatter",
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT", "CATEGORY"],
        "graph.metrics": ["count"],
      },
    });

    // Use force=true because this chart has too many bubbles that overlap with each other
    await triggerPopoverForBubble(page, 300, true);
    await assertEChartsTooltip(page, {
      header: "2028",
      rows: [{ name: "Widget", value: "173" }],
    });

    await assertEChartsTooltipNotContain(page, ["Gizmo", "Gadget", "Doohickey"]);
  });

  test("should not display data points even when enabled in settings (metabase#13247)", async ({
    page,
  }) => {
    await visitAdhoc(page, {
      display: "scatter",
      dataset_query: testQuery,
      visualization_settings: {
        "graph.metrics": ["count"],
        "graph.dimensions": ["CREATED_AT"],
        "graph.show_values": true,
      },
    });

    await expect(page.getByText("Visualization", { exact: true })).toBeVisible();
    await expect(page.getByText("79", { exact: true })).toHaveCount(0);
  });

  test("should respect circle size in a visualization (metabase#22929)", async ({
    page,
  }) => {
    await visitNativeAdhoc(page, {
      dataset_query: {
        type: "native",
        native: {
          query: `select 1 as size, 1 as x, 5 as y union all
select 10 as size, 2 as x, 5 as y`,
        },
        database: SAMPLE_DB_ID,
      },
      display: "scatter",
      visualization_settings: {
        "scatter.bubble": "SIZE",
        "graph.dimensions": ["X"],
        "graph.metrics": ["Y"],
      },
    });

    const circles = cartesianChartCircles(page);
    await expect(circles).toHaveCount(2);

    const TOLERANCE = 0.1;
    const radii: number[] = [];
    const count = await circles.count();
    for (let index = 0; index < count; index++) {
      const box = await circles.nth(index).boundingBox();
      expect(box).not.toBeNull();
      const { width, height } = box!;
      expect(width).toBeGreaterThan(0);
      expect(height).toBeGreaterThanOrEqual(width - TOLERANCE);
      expect(height).toBeLessThanOrEqual(width + TOLERANCE);
      radii.push(width);
    }

    expect(radii[0]).not.toEqual(radii[1]);
  });

  test("should allow adding non-series columns to the tooltip", async ({
    page,
  }) => {
    const allTooltipRows = [
      { name: "Tax", value: "0.86" },
      { name: "ID", value: "562" },
      { name: "User ID", value: "70" },
      { name: "Product ID", value: "61" },
      { name: "Total", value: "16.55" },
      { name: "Discount", value: "" },
      { name: "Created At", value: "July 4, 2026, 4:57 AM" },
      { name: "Quantity", value: "4" },
    ];

    await visitAdhoc(page, {
      display: "scatter",
      dataset_query: {
        type: "query",
        database: SAMPLE_DB_ID,
        query: { "source-table": ORDERS_ID },
      },
      visualization_settings: {
        "graph.metrics": ["TAX"],
        "graph.dimensions": ["SUBTOTAL"],
      },
    });

    // The shared assertEChartsTooltip asserts on `value != null`, but the
    // Cypress original skips falsy values (`if (value)`), so the empty-string
    // "Discount" value is never matched — only its row must exist. Omit the
    // empty value here and assert the "Discount" label separately, matching
    // upstream fidelity.
    const withoutEmptyValues = allTooltipRows.map((row) =>
      row.value === "" ? { name: row.name } : row,
    );

    await cartesianChartCircles(page).first().hover();
    await assertEChartsTooltip(page, {
      header: "15.69",
      rows: withoutEmptyValues,
    });
    await expect(
      echartsTooltip(page).getByText("Discount", { exact: true }),
    ).toBeVisible();

    await openVizSettingsSidebar(page);
    // Resizing animation due to the sidebar
    await page.waitForTimeout(200);

    const columnsToRemove = allTooltipRows.slice(2).map((row) => row.name);

    const sidebar = leftSidebar(page);
    await sidebar.getByText("Display", { exact: true }).click();

    for (const columnName of columnsToRemove) {
      const pillList = sidebar
        .getByRole("textbox", { name: "Enter column names", exact: true })
        .locator("xpath=..");
      await pillList
        .getByText(columnName, { exact: true })
        .locator("xpath=following-sibling::button | preceding-sibling::button")
        .click();
    }

    await cartesianChartCircles(page).first().hover();

    await assertEChartsTooltipNotContain(page, columnsToRemove);
    await assertEChartsTooltip(page, {
      header: "15.69",
      rows: allTooltipRows.slice(0, 2),
    });
  });
});
