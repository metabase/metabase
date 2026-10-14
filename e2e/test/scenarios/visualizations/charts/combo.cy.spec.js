const { H } = cy;
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { PRODUCTS, PRODUCTS_ID, ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

describe("scenarios > visualizations > combo", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
  });

  it("should render values on data points", () => {
    H.visitQuestionAdhoc({
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

    H.echartsContainer().findByText("408.66");
  });

  it("should support stacking", () => {
    H.visitQuestionAdhoc({
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

    H.openVizSettingsSidebar();
    H.ensureChartIsActive();
    cy.findByTestId("chartsettings-sidebar").within(() => {
      cy.findByText("Display").click();
      cy.findByText("Stack").click();
    });

    H.getValueLabels().should("have.length.greaterThan", 0);

    // First circle of the line series
    H.cartesianChartCircleWithColor("#A989C5").eq(0).trigger("mousemove");
    H.assertEChartsTooltip({
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
    H.cartesianChartCircleWithColor("#98D9D9").eq(0).trigger("mousemove");

    // Check the tooltip shows only stacked areas series
    H.assertEChartsTooltip({
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
    H.chartPathWithFillColor("#7172AD").eq(0).realHover();
    H.assertEChartsTooltip({
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
    cy.findByTestId("chartsettings-sidebar").findByText("Stack - 100%").click();

    // Ensure y-axis has 100% tick
    H.echartsContainer().findByText("100%");
  });

  it("should apply per-series display type on a question and dashcard (metabase#69882)", () => {
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

    H.createQuestion(questionDetails, { visitQuestion: true, wrapId: true });

    H.echartsContainer().should("be.visible");
    H.chartPathWithFillColor(DOOHICKEY_BAR_COLOR).should("exist");
    H.cartesianChartCircleWithColor(GADGET_LINE_COLOR);

    H.createDashboard({ name: "Test Dashboard" }, { wrapId: true });
    cy.get("@questionId").then((cardId) => {
      cy.get("@dashboardId").then((dashboardId) => {
        H.addQuestionToDashboard({ dashboardId, cardId });
        H.visitDashboard(dashboardId);
      });
    });

    cy.findByTestId("dashcard").within(() => {
      H.echartsContainer().should("be.visible");
      H.chartPathWithFillColor(DOOHICKEY_BAR_COLOR).should("exist");
      H.cartesianChartCircleWithColor(GADGET_LINE_COLOR);
    });
  });
});
