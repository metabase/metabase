import { restore, openOrdersTable } from "__support__/e2e/helpers";

describe("#22206 adding and removing columns doesn't duplicate columns", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    openOrdersTable();

    cy.findByTestId("loading-spinner").should("not.exist");
  });

  it("should not duplicate column in settings when removing and adding it back", () => {
    cy.findByText("Settings").click();

    cy.findByTestId("sidebar-content")
      .findByText("Add or remove columns")
      .click();

    // remove column
    cy.findByTestId("sidebar-content").findByText("Subtotal").click();

    // rerun query
    cy.get(".RunButton").first().click();
    cy.wait("@dataset");
    cy.findByTestId("loading-spinner").should("not.exist");

    // add column back again
    cy.findByTestId("sidebar-content").findByText("Subtotal").click();

    cy.wait("@dataset");
    cy.findByTestId("loading-spinner").should("not.exist");

    // fails because there are 2 columns, when there should be one
    cy.findByTestId("sidebar-content").findByText("Subtotal");

    // if you add it back again it crashes the question
  });
});
