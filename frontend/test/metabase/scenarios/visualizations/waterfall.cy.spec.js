import { signInAsNormalUser, restore } from "__support__/cypress";

describe("scenarios > visualizations > waterfall", () => {
  beforeEach(() => {
    restore();
    signInAsNormalUser();
  });

  it("should work with ordinal series", () => {
    cy.visit("/question/new");
    cy.contains("Native query").click();
    cy.get(".ace_content").type(
      "select 'A' as product, 10 as profit union select 'B' as product, -4 as profit",
    );
    cy.get(".NativeQueryEditor .Icon-play").click();
    cy.contains("Visualization").click();
    cy.get(".Icon-waterfall").click();

    cy.get(".Visualization .x-axis-label").within(() => {
      cy.findByText("PRODUCT");
    });
    cy.get(".Visualization .y-axis-label").within(() => {
      cy.findByText("PROFIT");
    });
    cy.get(".Visualization .axis.x").within(() => {
      cy.findByText("Total");
    });
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

    cy.get(".Visualization .x-axis-label").within(() => {
      cy.findByText("XX");
    });
    cy.get(".Visualization .y-axis-label").within(() => {
      cy.findByText("YY");
    });
    cy.get(".Visualization .axis.x").within(() => {
      cy.findByText("Total");
    });
  });

  it("should work with time-series data", () => {
    cy.visit("/");
    cy.findByText("Ask a question").click();
    cy.findByText("Custom question").click();
    cy.findByText("Sample Dataset").click();
    cy.findByText("Orders").click();
    cy.findByText("Pick the metric you want to see").click();
    cy.findByText("Count of rows").click();
    cy.findByText("Pick a column to group by").click();
    cy.findByText("Created At").click();
    cy.findByText("Add filters to narrow your answer").click();
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

    cy.get(".Visualization .x-axis-label").within(() => {
      cy.findByText("Created At");
    });
    cy.get(".Visualization .y-axis-label").within(() => {
      cy.findByText("Count");
    });
    cy.get(".Visualization .axis.x").within(() => {
      cy.findByText("Total");
    });
  });

  it("should hide the Total label if there is no space", () => {
    cy.visit("/");
    cy.findByText("Ask a question").click();
    cy.findByText("Custom question").click();
    cy.findByText("Sample Dataset").click();
    cy.findByText("Orders").click();
    cy.findByText("Pick the metric you want to see").click();
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
    });

    it("should allow toggling of the total bar", () => {
      cy.visit("/question/new");
      cy.contains("Native query").click();
      cy.get(".ace_content").type("select 'A' as X, 42 as Y");
      cy.get(".NativeQueryEditor .Icon-play").click();
      cy.contains("Visualization").click();
      cy.get(".Icon-waterfall").click();
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
      cy.visit("/question/new");
      cy.contains("Native query").click();
      cy.get(".ace_content").type("select 'A' as X, -4.56 as Y");
      cy.get(".NativeQueryEditor .Icon-play").click();
      cy.contains("Visualization").click();
      cy.get(".Icon-waterfall").click();
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
