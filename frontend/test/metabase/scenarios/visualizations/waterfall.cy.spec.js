import {
  openOrdersTable,
  restore,
  visitQuestionAdhoc,
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
    cy.visit("/question/new");
    cy.contains("Native query").click();
    cy.get(".ace_content").type(
      "select 'A' as product, 10 as profit union select 'B' as product, -4 as profit",
    );
    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.contains("Visualization").click();
    cy.icon("waterfall").click();

    verifyWaterfallRendering("PRODUCT", "PROFIT");
  });

  it("should work with quantitative series", () => {
    cy.visit("/question/new");
    cy.contains("Native query").click();
    cy.get(".ace_content").type(
      "select 1 as xx, 10 as yy union select 2 as xx, -2 as yy",
    );
    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.contains("Visualization").click();
    cy.icon("waterfall").click();

    cy.contains("Select a field").click();
    cy.get(".List-item")
      .first()
      .click(); // X
    cy.contains("Select a field").click();
    cy.get(".List-item")
      .last()
      .click(); // Y

    verifyWaterfallRendering("XX", "YY");
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
    cy.findByRole("button", { name: "Done" }).click();

    cy.findByText("Visualize").click();
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

    cy.findByText("Visualize").click();
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

  describe("scenarios > visualizations > waterfall settings", () => {
    beforeEach(() => {
      restore();
      cy.signInAsNormalUser();
      cy.visit("/question/new");
      cy.contains("Native query").click();
      cy.get(".ace_content").type("select 'A' as X, -4.56 as Y");
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
