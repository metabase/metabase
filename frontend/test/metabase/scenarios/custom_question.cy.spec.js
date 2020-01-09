import { signInAsAdmin, restore } from "__support__/cypress";

describe("custom question", () => {
  before(restore);
  beforeEach(signInAsAdmin);
  it("should allow post-aggregation filters", () => {
    // count orders by user id, filter to the one user with 46 orders
    cy.visit("/question/new");
    cy.contains("Custom question").click();
    cy.contains("Sample Dataset").click();
    cy.contains("Orders").click();
    cy.contains("Pick the metric").click();
    cy.contains("Count of rows").click();
    cy.contains("Pick a column to group by").click();
    cy.contains("User ID").click();
    cy.get(".Icon-filter").click();
    cy.get(".Icon-int").click();
    cy.get(".PopoverBody input").type("46");
    cy.get(".PopoverBody")
      .contains("Add filter")
      .click();
    cy.contains("Visualize").click();
    cy.contains("2372"); // user's id in the table
    cy.contains("Showing 1 row"); // ensure only one user was returned
  });
});
