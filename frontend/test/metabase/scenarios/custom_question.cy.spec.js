import { signInAsAdmin, popover, restore } from "__support__/cypress";

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
    popover()
      .find(".Icon-int")
      .click();
    popover()
      .find("input")
      .type("46");
    popover()
      .contains("Add filter")
      .click();
    cy.contains("Visualize").click();
    cy.contains("2372"); // user's id in the table
    cy.contains("Showing 1 row"); // ensure only one user was returned
  });
});
