import {
  openOrdersTable,
  signInAsNormalUser,
  restore,
} from "__support__/cypress";

describe("scenarios > visualizations > waterfall", () => {
  beforeEach(() => {
    restore();
    signInAsNormalUser();
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
    cy.get(".Icon-waterfall").click();

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
    cy.get(".Icon-waterfall").click();

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
    cy.findByText("Created At").click();
    cy.get("input[placeholder='30']")
      .clear()
      .type("12")
      .blur();
    cy.findByText("Days").click();
    cy.findByText("Months").click();
    cy.findByText("Add filter").click();
    cy.findByText("Visualize").click();
    cy.contains("Visualization").click();
    cy.get(".Icon-waterfall").click();

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
    cy.get(".Icon-waterfall").click();

    cy.get(".Visualization .axis.x").within(() => {
      cy.findByText("Total").should("not.exist");
    });
  });

  describe("scenarios > visualizations > waterfall settings", () => {
    beforeEach(() => {
      restore();
      signInAsNormalUser();
      cy.visit("/question/new");
      cy.contains("Native query").click();
      cy.get(".ace_content").type("select 'A' as X, -4.56 as Y");
      cy.get(".NativeQueryEditor .Icon-play").click();
      cy.contains("Visualization").click();
      cy.get(".Icon-waterfall").click();
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
