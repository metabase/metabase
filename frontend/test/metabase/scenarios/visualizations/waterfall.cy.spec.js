import {
  openOrdersTable,
  restore,
  visitQuestionAdhoc,
  openNativeEditor,
} from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS, ORDERS_ID } = SAMPLE_DATASET;

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
    cy.contains("Visualization").click();
    cy.icon("waterfall").click();

    verifyWaterfallRendering("PRODUCT", "PROFIT");
  });

  it("should work with ordinal series and numeric X-axis (metabase#15550)", () => {
    openNativeEditor().type(
      "select 1 as X, 20 as Y union select 2 as X, -10 as Y",
    );

    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.contains("Visualization").click();
    cy.icon("waterfall").click();

    cy.contains("Select a field").click();
    cy.get(".List-item")
      .contains("X")
      .click();

    cy.contains("Select a field").click();
    cy.get(".List-item")
      .contains("Y")
      .click();

    cy.contains("Axes").click();

    cy.contains("Linear").click();
    cy.get(".List-item")
      .contains("Ordinal")
      .click();

    verifyWaterfallRendering("X", "Y");
  });

  it("should work with quantitative series", () => {
    openNativeEditor().type(
      "select 1 as X, 10 as Y union select 2 as X, -2 as Y",
    );
    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.contains("Visualization").click();
    cy.icon("waterfall").click();

    cy.contains("Select a field").click();
    cy.get(".List-item")
      .contains("X")
      .click();
    cy.contains("Select a field").click();
    cy.get(".List-item")
      .contains("Y")
      .click();

    verifyWaterfallRendering("X", "Y");
  });

  it("should work with time-series data", () => {
    openOrdersTable({ mode: "notebook" });
    cy.findByText("Summarize").click();
    cy.findByText("Count of rows").click();
    cy.findByText("Pick a column to group by").click();
    cy.findByText("Created At").click();
    cy.findByText("Filter").click();
    cy.findByText("Custom Expression").click();
    cy.get("[contenteditable=true]")
      .type("between([Created At], '2016-01-01', '2016-08-01')")
      .blur();
    cy.button("Done").click();

    cy.button("Visualize").click();
    cy.contains("Visualization").click();
    cy.icon("waterfall").click();

    verifyWaterfallRendering("Created At", "Count");
  });

  it("should hide the Total label if there is no space", () => {
    openOrdersTable({ mode: "notebook" });
    cy.findByText("Summarize").click();
    cy.findByText("Count of rows").click();
    cy.findByText("Pick a column to group by").click();
    cy.findByText("Created At").click();

    cy.button("Visualize").click();
    cy.contains("Visualization").click();
    cy.icon("waterfall").click();

    cy.get(".Visualization .axis.x").within(() => {
      cy.findByText("Total").should("not.exist");
    });
  });

  it.skip("should not be enabled for multi-series questions (metabase#15152)", () => {
    cy.server();
    cy.route("POST", "/api/dataset").as("dataset");

    visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"], ["sum", ["field-id", ORDERS.TOTAL]]],
          breakout: [
            ["datetime-field", ["field-id", ORDERS.CREATED_AT], "year"],
          ],
        },
        database: 1,
      },
      display: "line",
    });

    cy.wait("@dataset");
    cy.findByText("Visualization").click();

    cy.findByText("Waterfall")
      .parent()
      .should("not.have.css", "opacity", "1");
  });

  it.skip("should work for unaggregated data (metabase#15465)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        type: "native",
        native: {
          query:
            "SELECT parsedatetime('2020-01-01', 'yyyy-MM-dd') AS \"d\", 1 AS \"c\" UNION ALL\nSELECT parsedatetime('2020-01-01', 'yyyy-MM-dd') AS \"d\", 2 AS \"c\" UNION ALL\nSELECT parsedatetime('2020-01-02', 'yyyy-MM-dd') AS \"d\", 3 AS \"c\"",
        },
        database: 1,
      },
    });
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
        database: 1,
      },
      display: "waterfall",
      visualization_settings: {
        "graph.show_values": true,
      },
    });

    cy.get(".value-label")
      .as("labels")
      .eq(-3)
      .invoke("text")
      .should("eq", "0");

    cy.get("@labels")
      .last()
      .invoke("text")
      .should("eq", "0.1");
  });

  it("should display correct values when one of them is null (metabase#16246)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        type: "native",
        native: {
          query:
            "SELECT * FROM (\nVALUES \n('a',2),\n('b',1),\n('c',-0.5),\n('d',-0.5),\n('e',0.1),\n('f',null),\n('g', -2)\n)\n",
          "template-tags": {},
        },
        database: 1,
      },
      display: "waterfall",
      visualization_settings: {
        "graph.show_values": true,
      },
    });

    cy.get(".value-label")
      .as("labels")
      .eq(-3)
      .invoke("text")
      .should("eq", "0");

    cy.get("@labels")
      .last()
      .invoke("text")
      .should("eq", "0.1");
  });

  describe("scenarios > visualizations > waterfall settings", () => {
    beforeEach(() => {
      restore();
      cy.signInAsNormalUser();

      openNativeEditor().type("select 'A' as X, -4.56 as Y");
      cy.get(".NativeQueryEditor .Icon-play").click();
      cy.contains("Visualization").click();
      cy.icon("waterfall").click();
    });

    it("should have increase, decrease, and total color options", () => {
      cy.contains("Display").click();
      cy.findByText("Increase color").click();
      cy.findByText("Decrease color").click();
      cy.findByText("Total color").click();
    });

    it("should allow toggling of the total bar", () => {
      cy.contains("Display").click();

      cy.contains("Show total")
        .next()
        .click();

      cy.get(".Visualization .axis.x").within(() => {
        cy.findByText("Total").should("not.exist");
      });

      cy.contains("Show total")
        .next()
        .click();
      cy.get(".Visualization .axis.x").within(() => {
        cy.findByText("Total");
      });
    });

    it("should allow toggling of value labels", () => {
      cy.contains("Display").click();

      cy.get(".Visualization .value-label").should("not.exist");

      cy.contains("Show values on data points")
        .next()
        .click();
      cy.get(".Visualization .value-label").within(() => {
        cy.findByText("(4.56)"); // negative in parentheses
      });
    });
  });
});
