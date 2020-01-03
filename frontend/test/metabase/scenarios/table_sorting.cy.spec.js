import { signInAsAdmin } from "__support__/cypress";

describe("table sorting", () => {
  beforeEach(signInAsAdmin);

  it("should sort structured queries", () => {
    // List orders for user #4
    cy.visit("/");
    cy.contains("Ask a question").click();
    cy.contains("Simple question").click();
    cy.contains("Sample Dataset").click();
    cy.contains("Orders").click();
    cy.contains("Filter").click();
    cy.contains("Filter by")
      .parent()
      .parent()
      .as("sidebar");
    cy.get("@sidebar")
      .contains("User ID")
      .click();
    cy.get("@sidebar")
      .get(`input[placeholder="Enter an ID"]`)
      .type("4");
    cy.contains("Add filter").click();
    cy.get(".TableInteractive-header").contains("ID");

    verifySortingBySubtotal();
  });

  it("should sort native queries", () => {
    // List orders for user #4
    cy.visit("/");
    cy.contains("Ask a question").click();
    cy.contains("Native query").click();
    cy.contains("Sample Dataset").click();
    cy.get(".ace_content").type("SELECT * FROM ORDERS WHERE USER_ID = 4");
    cy.get(".NativeQueryEditor .Icon-play").click();

    verifySortingBySubtotal();
  });
});

function verifySortingBySubtotal() {
  // sort by subtotal ascending
  cy.contains(/Subtotal/i).click(); // case-insensitive match to catch both Subtotal and SUBTOTAL
  cy.contains("Ascending").click();

  // should indicate the sort direction
  cy.contains(/Subtotal/i)
    .get(".Icon-chevronup")
    .should("exist");
  cy.contains(/Subtotal/i)
    .closest(".TableInteractive-headerCellData--sorted")
    .should("exist");

  // This row should be first
  cy.contains("September 20, 2019")
    .parent()
    .should("have.css", "top", "0px");
  // This row should be last
  cy.contains("December 21, 2019")
    .parent()
    .should("have.css", "top", "108px");

  // sort by subtotal descending
  cy.contains(/Subtotal/i).click();
  cy.contains("Descending");
  cy.contains("Ascending").should("not.exist");
  cy.contains("Descending").click();

  // should indicate the sort direction
  cy.contains(/Subtotal/i)
    .get(".Icon-chevrondown")
    .should("exist");
  cy.contains(/Subtotal/i)
    .closest(".TableInteractive-headerCellData--sorted")
    .should("exist");

  // Now, this row should be last
  cy.contains("September 20, 2019")
    .parent()
    .should("have.css", "top", "108px");
  // Now, this row should be first
  cy.contains("December 21, 2019")
    .parent()
    .should("have.css", "top", "0px");
}
