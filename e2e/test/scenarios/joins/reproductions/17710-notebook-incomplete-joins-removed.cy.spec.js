import {
  restore,
  popover,
  openOrdersTable,
  visualize,
} from "e2e/support/helpers";

describe("issue 17710", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    restore();
    cy.signInAsAdmin();
  });

  it("should remove only invalid join clauses (metabase#17710)", () => {
    openOrdersTable({ mode: "notebook" });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Join data").click();
    popover().findByText("Products").click();

    cy.findByTestId("step-join-0-0").within(() => {
      cy.icon("add").click();
    });

    visualize();

    cy.icon("notebook")
      .click()
      .then(() => {
        cy.findByTestId("step-join-0-0").within(() => {
          cy.findByText("ID");
          cy.findByText("Product ID");
        });
      });
  });
});
