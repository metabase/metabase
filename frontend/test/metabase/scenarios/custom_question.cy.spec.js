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

  it("should allow joins", () => {
    // start a custom question with orders
    cy.visit("/question/new");
    cy.contains("Custom question").click();
    cy.contains("Sample Dataset").click();
    cy.contains("Orders").click();

    // join to Reviews on orders.product_id = reviews.product_id
    cy.get(".Icon-join_left_outer").click();
    popover()
      .contains("Reviews")
      .click();
    popover()
      .contains("Product ID")
      .click();
    popover()
      .contains("Product ID")
      .click();

    // get the average rating across all rows (not a useful metric)
    cy.contains("Pick the metric you want to see").click();
    popover()
      .contains("Average of")
      .click();
    popover()
      .find(".Icon-join_left_outer")
      .click();
    popover()
      .contains("Rating")
      .click();
    cy.contains("Visualize").click();
    cy.contains("Orders + Reviews");
    cy.contains("3");
  });
});
