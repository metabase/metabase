import { restore, openOrdersTable } from "e2e/support/helpers";

describe("#22206 adding and removing columns doesn't duplicate columns", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    openOrdersTable();

    cy.findByTestId("loading-spinner").should("not.exist");
  });

  it("should not duplicate column in settings when removing and adding it back", () => {
    cy.findByTestId("viz-settings-button").click();

    // remove column
    cy.findByTestId("sidebar-content")
      .findByText("Subtotal")
      .parent()
      .find(".Icon-eye_outline")
      .click();

    // rerun query
    cy.get(".RunButton").first().click();
    cy.wait("@dataset");
    cy.findByTestId("loading-spinner").should("not.exist");

    // add column back again
    cy.findByTestId("sidebar-content")
      .findByText("Subtotal")
      .parent()
      .find(".Icon-add")
      .click();

    cy.wait("@dataset");
    cy.findByTestId("loading-spinner").should("not.exist");

    // fails because there are 2 columns, when there should be one
    cy.findByTestId("sidebar-content").findByText("Subtotal");

    // if you add it back again it crashes the question
  });
});
