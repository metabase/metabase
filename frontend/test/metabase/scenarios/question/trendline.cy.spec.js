import {
  restore,
  signInAsNormalUser,
  openOrdersTable,
  sidebar,
} from "__support__/cypress";

describe("scenarios > question > trendline", () => {
  before(restore);
  beforeEach(signInAsNormalUser);

  it.skip("displays trendline when there are multiple numeric outputs (for simple question) (Issue #12781)", () => {
    // Create question: orders summarized with "Average of Subtotal" and "Sum of Total" by CreatedAt:Year
    openOrdersTable();
    cy.get(".Icon-notebook").click();
    cy.findByText("Summarize").click();
    cy.findByText("Average of ...").click();
    cy.findByText("Subtotal").click();

    cy.get(".Icon-add")
      .last()
      .click();
    cy.findByText("Sum of ...").click();
    cy.findByText("Total").click();

    cy.findByText("Pick a column to group by").click();
    cy.findByText("Created At").click();
    cy.findByText("Created At: Month").click();
    cy.findByText("by month").click();
    cy.findByText("Year").click();

    cy.findByText("Visualize").click();

    // Check graph is there
    cy.findByText("Visualize").should("not.exist");
    cy.findByText("Visualization");
    cy.get("rect");

    // Change settings to trendline
    cy.findByText("Visualization").click();
    sidebar().within(() => {
      cy.get(".Icon-line").click();
    });
    cy.findByText("Display").click();
    cy.findByText("Trend line")
      .parent()
      .children()
      .last()
      .click();

    // Check graph is still there
    cy.get("rect");

    // Remove sum of total
    cy.findByText("Data").click();
    sidebar().within(() => {
      cy.get(".Icon-close")
        .last()
        .click();
      cy.findByText("Done").click();
    });

    // Graph should still exist
    cy.findByPlaceholderText("Created At").should("not.exist");
    cy.get("rect");
  });
});
