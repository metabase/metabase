import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  echartsContainer,
  restore,
  visitQuestionAdhoc,
  testTooltipPairs,
  cartesianChartCircleWithColor,
  testStackedTooltipRows,
  chartPathWithFillColor,
} from "e2e/support/helpers";

const { PRODUCTS, PRODUCTS_ID, ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

describe("scenarios > visualizations > combo", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should render values on data points", () => {
    visitQuestionAdhoc({
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"], ["sum", ["field", PRODUCTS.PRICE, null]]],
          breakout: [
            [
              "field",
              PRODUCTS.CREATED_AT,
              {
                "temporal-unit": "month",
              },
            ],
          ],
        },
        type: "query",
      },
      display: "combo",
      displayIsLocked: true,
      visualization_settings: {
        "graph.show_values": true,
      },
    });
    // First value label on the chart
    cy.findAllByText("390.99");
  });

  it("should support stacking", () => {
    visitQuestionAdhoc({
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
            [
              "field",
              ORDERS.CREATED_AT,
              {
                "temporal-unit": "year",
              },
            ],
          ],
        },
        type: "query",
      },
      display: "combo",
      displayIsLocked: true,
      visualization_settings: {
        "graph.show_values": true,
        series_settings: {
          // Adds an areas stack of two series
          min_2: { display: "area" },
          min: { display: "area" },
        },
      },
    });

    cy.findByTestId("viz-settings-button").click();
    cy.findByTestId("chartsettings-sidebar").within(() => {
      cy.findByText("Display").click();
      cy.findByText("Stack").click();
    });

    // First circle of the line series
    cartesianChartCircleWithColor("#A989C5").eq(0).trigger("mousemove");
    testTooltipPairs([
      ["Created At:", "2022"],
      ["Average of Total:", "56.66"],
      ["Average of Subtotal:", "54.44"],
      ["Min of Total:", "12.32"],
      ["Min of Subtotal:", "15.69"],
      ["Max of Total:", "102.77"],
      ["Max of Subtotal:", "98.82"],
    ]);

    // First circle of stacked area series
    cartesianChartCircleWithColor("#98D9D9").eq(0).trigger("mousemove");

    // Check the tooltip shows only stacked areas series
    testStackedTooltipRows([
      ["Min of Subtotal", "15.69", "56.01 %"],
      ["Min of Total", "12.32", "43.99 %"],
      ["Total", "28.02", "100 %"],
    ]);

    // First bar of stacked bar series
    chartPathWithFillColor("#7172AD").eq(0).realHover();

    testStackedTooltipRows([
      ["Max of Subtotal", "98.82", "38.60 %"],
      ["Max of Total", "102.77", "40.14 %"],
      ["Average of Subtotal", "54.44", "21.26 %"],
      ["Total", "256.03", "100 %"],
    ]);

    // Switch to normalized stacking
    cy.findByTestId("chartsettings-sidebar").findByText("Stack - 100%").click();

    // Ensure y-axis has 100% tick
    echartsContainer().findByText("100%");
  });
});
