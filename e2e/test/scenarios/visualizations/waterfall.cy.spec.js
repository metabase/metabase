import {
  openOrdersTable,
  restore,
  visitQuestionAdhoc,
  openNativeEditor,
  visualize,
  summarize,
} from "e2e/support/helpers";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS } = SAMPLE_DATABASE;

describe("scenarios > visualizations > waterfall", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  function verifyWaterfallRendering(xLabel = null, yLabel = null) {
    // a waterfall chart is just a stacked bar chart, with 4 bars
    // (not all of them will be visible at once, but they should exist)
    cy.get(".Visualization .sub .chart-body").within(() => {
      cy.get(".stack._0");
      cy.get(".stack._1");
      cy.get(".stack._2");
      cy.get(".stack._3");
    });
    cy.get(".Visualization .axis.x").within(() => {
      cy.findByText("Total");
    });

    if (xLabel) {
      cy.get(".Visualization .x-axis-label").within(() => {
        cy.findByText(xLabel);
      });
    }
    if (yLabel) {
      cy.get(".Visualization .y-axis-label").within(() => {
        cy.findByText(yLabel);
      });
    }
  }

  it("should work with ordinal series", () => {
    openNativeEditor().type(
      "select 'A' as product, 10 as profit union select 'B' as product, -4 as profit",
    );
    cy.get(".NativeQueryEditor .Icon-play").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Visualization").click();
    cy.icon("waterfall").click();

    verifyWaterfallRendering("PRODUCT", "PROFIT");
  });

  it("should work with ordinal series and numeric X-axis (metabase#15550)", () => {
    openNativeEditor().type(
      "select 1 as X, 20 as Y union select 2 as X, -10 as Y",
    );

    cy.get(".NativeQueryEditor .Icon-play").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Visualization").click();
    switchToWaterfallDisplay();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Select a field").click();
    cy.get(".List-item").contains("X").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Select a field").click();
    cy.get(".List-item").contains("Y").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Axes").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Linear").click();
    cy.get(".List-item").contains("Ordinal").click();

    verifyWaterfallRendering("X", "Y");
  });

  it("should work with quantitative series", () => {
    openNativeEditor().type(
      "select 1 as X, 10 as Y union select 2 as X, -2 as Y",
    );
    cy.get(".NativeQueryEditor .Icon-play").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Visualization").click();
    switchToWaterfallDisplay();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Select a field").click();
    cy.get(".List-item").contains("X").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Select a field").click();
    cy.get(".List-item").contains("Y").click();

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
      .type("between([Created At], '2016-01-01', '2016-08-01')")
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

    cy.get(".Visualization .axis.x").within(() => {
      cy.findByText("Total").should("not.exist");
    });
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

    cy.findByTestId("remove-count").click();
    cy.get(".CardVisualization svg"); // Chart renders after removing the second metric

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
    cy.get(".List-item").contains("Created At").click();
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.contains("Select a field").click();
    cy.get(".List-item").contains("Count").click();

    cy.get(".CardVisualization svg"); // Chart renders after removing the second metric

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/Add another/).should("not.exist");
  });

  it("should work for unaggregated data (metabase#15465)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        type: "native",
        native: {
          query:
            "SELECT parsedatetime('2020-01-01', 'yyyy-MM-dd') AS \"d\", 1 AS \"c\" UNION ALL\nSELECT parsedatetime('2020-01-01', 'yyyy-MM-dd') AS \"d\", 2 AS \"c\" UNION ALL\nSELECT parsedatetime('2020-01-02', 'yyyy-MM-dd') AS \"d\", 3 AS \"c\"",
        },
        database: SAMPLE_DB_ID,
      },
    });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Visualization").click();
    cy.icon("waterfall").click({ force: true });
    cy.get(".Visualization .bar");
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

    cy.get(".value-label").as("labels").eq(-3).invoke("text").should("eq", "0");

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

    cy.get(".value-label").as("labels").eq(-3).invoke("text").should("eq", "");

    cy.get("@labels").last().invoke("text").should("eq", "0.1");
  });

  describe("scenarios > visualizations > waterfall settings", () => {
    beforeEach(() => {
      restore();
      cy.signInAsNormalUser();

      openNativeEditor().type("select 'A' as X, -4.56 as Y");
      cy.get(".NativeQueryEditor .Icon-play").click();
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

      cy.get(".Visualization .axis.x").within(() => {
        cy.findByText("Total").should("not.exist");
      });

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Show total").next().click();
      cy.get(".Visualization .axis.x").within(() => {
        cy.findByText("Total");
      });
    });

    it("should allow toggling of value labels", () => {
      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Display").click();

      cy.get(".Visualization .value-label").should("not.exist");

      // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
      cy.contains("Show values on data points").next().click();
      cy.get(".Visualization .value-label").contains(4.56).should("be.visible");
    });
  });
});

const switchToWaterfallDisplay = () => {
  cy.icon("waterfall").click();
  cy.findByTestId("Waterfall-button").within(() => {
    cy.icon("gear").click();
  });
};
