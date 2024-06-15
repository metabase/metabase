import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  openOrdersTable,
  restore,
  visitQuestionAdhoc,
  openNativeEditor,
  visualize,
  summarize,
  echartsContainer,
  chartPathWithFillColor,
  testPairedTooltipValues,
} from "e2e/support/helpers";

const { ORDERS, ORDERS_ID, PRODUCTS } = SAMPLE_DATABASE;

describe("scenarios > visualizations > waterfall", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  function verifyWaterfallRendering(xLabel = null, yLabel = null) {
    chartPathWithFillColor("#88BF4D").should("be.visible");
    chartPathWithFillColor("#4C5773").should("be.visible");
    echartsContainer().get("text").contains("Total");

    if (xLabel) {
      echartsContainer().get("text").contains(xLabel);
    }
    if (yLabel) {
      echartsContainer().get("text").contains(yLabel);
    }
  }

  it("should work with ordinal series", () => {
    openNativeEditor().type(
      "select 'A' as product, 10 as profit union select 'B' as product, -4 as profit",
    );
    cy.findByTestId("native-query-editor-container").icon("play").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Visualization").click();
    cy.icon("waterfall").click();

    verifyWaterfallRendering("PRODUCT", "PROFIT");
  });

  it("should work with ordinal series and numeric X-axis (metabase#15550)", () => {
    openNativeEditor().type(
      "select 1 as X, 20 as Y union select 2 as X, -10 as Y",
    );

    cy.findByTestId("native-query-editor-container").icon("play").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Visualization").click();
    switchToWaterfallDisplay();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Select a field").click();
    cy.get("[data-element-id=list-item]").contains("X").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Select a field").click();
    cy.get("[data-element-id=list-item]").contains("Y").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Axes").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Linear").click();
    cy.get("[data-element-id=list-item]").contains("Ordinal").click();

    verifyWaterfallRendering("X", "Y");
  });

  it("should work with quantitative series", () => {
    openNativeEditor().type(
      "select 1 as X, 10 as Y union select 2 as X, -2 as Y",
    );
    cy.findByTestId("native-query-editor-container").icon("play").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Visualization").click();
    switchToWaterfallDisplay();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Select a field").click();
    cy.get("[data-element-id=list-item]").contains("X").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Select a field").click();
    cy.get("[data-element-id=list-item]").contains("Y").click();

    verifyWaterfallRendering("X", "Y");
  });

  it("should work with time-series data", () => {
    openOrdersTable({ mode: "notebook" });
    summarize({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Count of rows").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column to group by").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Created At").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Filter").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Custom Expression").click();
    cy.get(".ace_text-input")
      .type("between([Created At: Month], '2022-01-01', '2022-08-01')")
      .blur();
    cy.button("Done").click();

    visualize();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Visualization").click();
    switchToWaterfallDisplay();

    verifyWaterfallRendering("Created At", "Count");
  });

  it("should hide the Total label if there is no space", () => {
    openOrdersTable({ mode: "notebook" });
    summarize({ mode: "notebook" });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Count of rows").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Pick a column to group by").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Created At").click();

    visualize();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Visualization").click();
    switchToWaterfallDisplay();

    echartsContainer().get("text").contains("Total").should("not.exist");
  });

  it("should show error for multi-series questions (metabase#15152)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"], ["sum", ["field-id", ORDERS.TOTAL]]],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
        },
        database: SAMPLE_DB_ID,
      },
      display: "line",
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Visualization").click();
    switchToWaterfallDisplay();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Waterfall chart does not support multiple series");

    echartsContainer().should("not.exist");
    cy.findByTestId("remove-count").click();
    echartsContainer().should("exist"); // Chart renders after removing the second metric

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Add another/).should("not.exist");
  });

  it("should not allow you to choose X-axis breakout", () => {
    visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
            ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
          ],
        },
        database: SAMPLE_DB_ID,
      },
      display: "line",
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Visualization").click();
    switchToWaterfallDisplay();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Select a field").click();
    cy.get("[data-element-id=list-item]").contains("Created At").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Select a field").click();
    cy.get("[data-element-id=list-item]").contains("Count").click();

    echartsContainer().should("exist"); // Chart renders after adding a metric

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Add another/).should("not.exist");
  });

  it("should work for unaggregated data (metabase#15465)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        type: "native",
        native: {
          query:
            "SELECT parsedatetime('2026-01-01', 'yyyy-MM-dd') AS \"d\", 1 AS \"c\" UNION ALL\nSELECT parsedatetime('2026-01-01', 'yyyy-MM-dd') AS \"d\", 2 AS \"c\" UNION ALL\nSELECT parsedatetime('2026-01-02', 'yyyy-MM-dd') AS \"d\", 3 AS \"c\"",
        },
        database: SAMPLE_DB_ID,
      },
    });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Visualization").click();
    cy.icon("waterfall").click({ force: true });
    chartPathWithFillColor("#88BF4D").should("be.visible");
  });

  it("should display correct values when one of them is 0 (metabase#16246)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        type: "native",
        native: {
          query:
            "SELECT * FROM (\nVALUES \n('a',2),\n('b',1),\n('c',-0.5),\n('d',-0.5),\n('e',0.1),\n('f',0),\n('g', -2)\n)\n",
          "template-tags": {},
        },
        database: SAMPLE_DB_ID,
      },
      display: "waterfall",
      visualization_settings: {
        "graph.show_values": true,
      },
    });

    getWaterfallDataLabels()
      .as("labels")
      .eq(-3)
      .invoke("text")
      .should("eq", "0");

    cy.get("@labels").last().invoke("text").should("eq", "0.1");
  });

  it("should now display null values (metabase#16246)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        type: "native",
        native: {
          query:
            "SELECT * FROM (\nVALUES \n('a',2),\n('b',1),\n('c',-0.5),\n('d',-0.5),\n('e',0.1),\n('f',null),\n('g', -2)\n)\n",
          "template-tags": {},
        },
        database: SAMPLE_DB_ID,
      },
      display: "waterfall",
      visualization_settings: {
        "graph.show_values": true,
      },
    });

    // the null data label which should exist at index -3
    // should now display no label. so the label at index -3 should be the label
    // before the null data point
    getWaterfallDataLabels()
      .as("labels")
      .eq(-3)
      .invoke("text")
      .should("eq", "0.1");

    // but the x-axis label and area should still be shown for the null data point
    echartsContainer().findByText("f");

    getWaterfallDataLabels()
      .as("labels")
      .eq(-2)
      .invoke("text")
      .should("eq", "(2)");

    cy.get("@labels").last().invoke("text").should("eq", "0.1");
  });

  it("should correctly apply column value scaling in tool-tips (metabase#44176)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        type: "native",
        native: {
          query:
            "SELECT * FROM (\nVALUES \n('a',2),\n('b',1),\n('c',-0.5),\n('d',-0.5),\n('e',0.1),\n('f', -2)\n)\n",
          "template-tags": {},
        },
        database: SAMPLE_DB_ID,
      },
      display: "waterfall",
      visualization_settings: {
        "graph.show_values": true,
        column_settings: { '["name","C2"]': { scale: 0.1 } },
      },
    });

    getWaterfallDataLabels().first().invoke("text").should("eq", "0.2");

    chartPathWithFillColor("#88BF4D").first().trigger("mousemove");

    testPairedTooltipValues("C2:", "0.2");
  });

  describe("scenarios > visualizations > waterfall settings", () => {
    beforeEach(() => {
      restore();
      cy.signInAsNormalUser();

      openNativeEditor().type("select 'A' as X, -4.56 as Y");
      cy.findByTestId("native-query-editor-container").icon("play").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Visualization").click();
      switchToWaterfallDisplay();
    });

    it("should have increase, decrease, and total color options", () => {
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Display").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Increase color").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Decrease color").click();
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.findByText("Total color").click();
    });

    it("should allow toggling of the total bar", () => {
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Display").click();

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Show total").next().click();

      echartsContainer().get("text").contains("Total").should("not.exist");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Show total").next().click();
      echartsContainer().get("text").contains("Total").should("exist");
    });

    it("should allow toggling of value labels", () => {
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Display").click();

      echartsContainer().get("text").contains("(4.56)").should("not.exist");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Show values on data points").next().click();
      echartsContainer().get("text").contains("(4.56)").should("be.visible");
    });
  });
});

const switchToWaterfallDisplay = () => {
  cy.icon("waterfall").click();
  cy.findByTestId("Waterfall-button").within(() => {
    cy.icon("gear").click();
  });
};

function getWaterfallDataLabels() {
  // paint-order='stroke' targets the waterfall labels only
  return echartsContainer().get("text[paint-order='stroke']");
}
