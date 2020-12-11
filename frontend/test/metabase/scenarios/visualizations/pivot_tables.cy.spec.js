import {
  signInAsAdmin,
  restore,
  openOrdersTable,
  popover,
} from "__support__/cypress";

describe("scenarios > visualizations > pivot tables", () => {
  beforeEach(() => {
    restore();
    signInAsAdmin();
  });

  it("should be created from an ad-hoc question", () => {
    cy.server();
    cy.route("POST", "/api/dataset").as("dataset");
    cy.route("POST", "/api/advanced_computation/pivot/dataset").as(
      "pivotTableDataset",
    );

    openOrdersTable({ mode: "notebook" });
    cy.findByText("Summarize").click();
    cy.findByText("Count of rows").click();
    cy.findByText("Pick a column to group by").click();
    popover().within(() => {
      cy.findByText(/Orders?$/).click(); // Collapse "Orders" to avoid additional scrolling
      cy.findByText(/Users?$/).click();
    });
    cy.get(".ReactVirtualized__Grid").scrollTo("bottom"); // "Source" is not visible - we have to scroll
    cy.findByText("Source").click();
    // Add another metric
    cy.get(".Icon-add")
      .last() // This is fragile, but there's no other way to get to this element right now
      .click();
    popover().within(() => {
      cy.findByText(/Products?$/).click();
      cy.findByText("Category").click();
    });
    cy.findByText("Visualize").click();
    cy.wait("@dataset");

    cy.findByText("Visualization").click();
    cy.get(".Icon-pivot_table").click();
    cy.wait("@pivotTableDataset");

    cy.findByText(/Count by Users? → Source and Products? → Category/); // ad-hoc title
    cy.get("[draggable=true]").as("fieldOption");

    cy.log("**-- Implicit side-bar assertions --**");
    cy.findByText(/Pivot Table options/i);

    cy.findByText("Fields to use for the table rows");
    cy.get("@fieldOption")
      .eq(0)
      .contains(/Users? → Source/);
    cy.findByText("Fields to use for the table columns");
    cy.get("@fieldOption")
      .eq(1)
      .contains(/Products? → Category/);
    cy.findByText("Fields to use for the table values");
    cy.get("@fieldOption")
      .eq(2)
      .contains("Count");

    cy.log("**-- Implicit assertions on a table itself --**");
    cy.get(".Visualization").within(() => {
      cy.findByText(/Users? → Source/);
      cy.findByText(/Row totals/i);
      cy.findByText(/Grand totals/i);
      cy.findByText("3,520");
      cy.findByText("4,784");
      cy.findByText("18,760");
    });
  });
});
