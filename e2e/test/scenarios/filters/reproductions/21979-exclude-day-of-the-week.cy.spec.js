import {
  filter,
  openProductsTable,
  restore,
  popover,
  getNotebookStep,
  visualize,
  queryBuilderMain,
} from "e2e/support/helpers";

describe("issue 21979", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("exclude 'day of the week' should show the correct day reference in the UI (metabase#21979)", () => {
    openProductsTable({ mode: "notebook" });

    filter({ mode: "notebook" });
    popover().within(() => {
      cy.findByText("Created At").click();
      cy.findByText("Exclude…").click();
      cy.findByText("Days of the week…").click();
      cy.findByLabelText("Monday").click();
      cy.button("Add filter").click();
    });

    getNotebookStep("filter")
      .findByText("Created At excludes Mondays")
      .should("be.visible");

    visualize();

    // Make sure the query is correct
    // (a product called "Enormous Marble Wallet" is created on Monday)
    queryBuilderMain().findByText("Enormous Marble Wallet").should("not.exist");

    cy.findByTestId("qb-filters-panel")
      .findByText("Created At excludes Mondays")
      .click();

    popover().within(() => {
      cy.findByLabelText("Monday").click();
      cy.findByLabelText("Thursday").click();
      cy.button("Update filter").click();
    });
    cy.wait("@dataset");

    queryBuilderMain()
      .findByText("Enormous Marble Wallet")
      .should("be.visible");

    cy.findByTestId("qb-filters-panel")
      .findByText("Created At excludes Thursdays")
      .should("be.visible");
  });
});
