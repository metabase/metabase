import { openOrdersTable, popover, restore } from "e2e/support/helpers";

describe("issue 29082", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should handle nulls in quick filters (metabase#29082)", () => {
    openOrdersTable();
    cy.wait("@dataset");

    cy.get(".TableInteractive-emptyCell").first().click();
    popover().within(() => cy.findByText("=").click());
    cy.wait("@dataset");
    cy.findByText("Discount is empty").should("exist");

    cy.get(".TableInteractive-emptyCell").first().click();
    popover().within(() => cy.findByText("≠").click());
    cy.wait("@dataset");
    cy.findByText("Discount is not empty").should("exist");
  });
});
