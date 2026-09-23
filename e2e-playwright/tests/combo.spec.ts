/**
 * Playwright port of
 * e2e/test/scenarios/visualizations-charts/combo.cy.spec.js
 *
 * Combo chart: mixed line + bar (+ area) series, per-series display type,
 * stacking, and value labels. No new helpers were needed — everything is
 * imported read-only from the shared support modules.
 *
 * Mapping notes:
 * - `H.visitQuestionAdhoc({ display, displayIsLocked, visualization_settings })`
 *   → visitAdhoc (viz-charts-repros). `displayIsLocked` is set automatically by
 *   adhocQuestionHash whenever `display != null` (permissions.ts), so it is
 *   omitted here and the produced hash is identical.
 * - `H.echartsContainer().findByText(str)` → echartsText (legend.ts): a
 *   whitespace-tolerant exact regex, because ECharts SVG <text> (axis ticks and
 *   data labels) can carry leading/trailing spaces that Playwright's getByText
 *   does not trim (axis-text-whitespace rule).
 * - `.eq(0)` → `.first()`.
 * - `.trigger("mousemove")` is a synthetic MouseEvent dispatch, NOT a real
 *   hover → triggerMousemove (line-chart.ts); `.realHover()` → hover().
 * - `cy.findByText(str)` string args are exact (port rule 1).
 */
import { openVizSettingsSidebar } from "../support/charts";
import { expect, test } from "../support/fixtures";
import { chartPathWithFillColor, echartsText } from "../support/legend";
import { triggerMousemove } from "../support/line-chart";
import { ensureChartIsActive } from "../support/metrics-explorer";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "../support/sample-data";
import {
  assertEChartsTooltip,
  cartesianChartCircleWithColor,
  visitAdhoc,
  vizSettingsSidebar,
} from "../support/viz-charts-repros";

const { PRODUCTS, PRODUCTS_ID, ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

test.describe("scenarios > visualizations > combo", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should render values on data points", async ({ page }) => {
    await visitAdhoc(page, {
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"], ["sum", ["field", PRODUCTS.PRICE, null]]],
          breakout: [
            ["field", PRODUCTS.CREATED_AT, { "temporal-unit": "month" }],
          ],
        },
        type: "query",
      },
      display: "combo",
      visualization_settings: {
        "graph.show_values": true,
      },
    });

    await expect(echartsText(page, "408.66").first()).toBeVisible();
  });

  test("should support stacking", async ({ page }) => {
    await visitAdhoc(page, {
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            ["avg", ["field", ORDERS.TOTAL, null]],
            ["avg", ["field", ORDERS.SUBTOTAL, null]],
            ["min", ["field", ORDERS.TOTAL, null]],
            ["min", ["field", ORDERS.SUBTOTAL, null]],
            ["max", ["field", ORDERS.TOTAL, null]],
            ["max", ["field", ORDERS.SUBTOTAL, null]],
          ],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
          ],
        },
        type: "query",
      },
      display: "combo",
      visualization_settings: {
        "graph.show_values": true,
        series_settings: {
          // Adds an areas stack of two series
          min_2: { display: "area" },
          min: { display: "area" },
        },
      },
    });

    await openVizSettingsSidebar(page);
    await ensureChartIsActive(page);
    const sidebar = vizSettingsSidebar(page);
    await sidebar.getByText("Display", { exact: true }).click();
    await sidebar.getByText("Stack", { exact: true }).click();

    // First circle of the line series
    await triggerMousemove(cartesianChartCircleWithColor(page, "#A989C5").first());
    await assertEChartsTooltip(page, {
      header: "2025",
      rows: [
        { color: "#A989C5", name: "Average of Total", value: "56.66" },
        { color: "#F2A86F", name: "Average of Subtotal", value: "54.44" },
        { color: "#EF8C8C", name: "Min of Total", value: "12.32" },
        { color: "#98D9D9", name: "Min of Subtotal", value: "15.69" },
        { color: "#F9D45C", name: "Max of Total", value: "102.77" },
        { color: "#7172AD", name: "Max of Subtotal", value: "98.82" },
      ],
    });

    // First circle of stacked area series
    await triggerMousemove(cartesianChartCircleWithColor(page, "#98D9D9").first());

    // Check the tooltip shows only stacked areas series
    await assertEChartsTooltip(page, {
      header: "2025",
      rows: [
        {
          color: "#EF8C8C",
          name: "Min of Total",
          value: "12.32",
          secondaryValue: "43.99 %",
        },
        {
          color: "#98D9D9",
          name: "Min of Subtotal",
          value: "15.69",
          secondaryValue: "56.01 %",
        },
        {
          name: "Total",
          value: "28.02",
          secondaryValue: "100 %",
        },
      ],
    });

    // First bar of stacked bar series
    await chartPathWithFillColor(page, "#7172AD").first().hover();
    await assertEChartsTooltip(page, {
      header: "2025",
      rows: [
        {
          color: "#7172AD",
          name: "Max of Subtotal",
          value: "98.82",
          secondaryValue: "38.60 %",
        },
        {
          color: "#F9D45C",
          name: "Max of Total",
          value: "102.77",
          secondaryValue: "40.14 %",
        },
        {
          color: "#F2A86F",
          name: "Average of Subtotal",
          value: "54.44",
          secondaryValue: "21.26 %",
        },
        {
          name: "Total",
          value: "256.03",
          secondaryValue: "100 %",
        },
      ],
    });

    // Switch to normalized stacking
    await vizSettingsSidebar(page)
      .getByText("Stack - 100%", { exact: true })
      .click();

    // Ensure y-axis has 100% tick
    await expect(echartsText(page, "100%").first()).toBeVisible();
  });
});
