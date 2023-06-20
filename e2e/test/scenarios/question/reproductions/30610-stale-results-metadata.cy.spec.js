import {
  openNotebook,
  openOrdersTable,
  popover,
  restore,
  saveQuestion,
  visualize,
} from "e2e/support/helpers";

describe("issue 30610", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should remove stale metadata when saving a new question (metabase#30610)", () => {
    openOrdersTable();
    openNotebook();
    cy.findByTestId("fields-picker").click();
    popover().findByText("Select none").click();
    saveQuestion("Orders with ID");

    cy.findByTestId("app-bar").findByText("New").click();
    popover().within(() => {
      cy.findByText("Question").click();
      cy.findByText("Saved Questions").click();
      cy.findByText("Orders with ID").click();
    });
    cy.findByTestId("fields-picker").click();
    popover().within(() => {
      cy.findByText("ID").should("be.visible");
      cy.findByText("Total").should("not.exist");
    });

    visualize();
    cy.findByTestId("TableInteractive-root").within(() => {
      cy.findByText("ID").should("exist");
      cy.findByText("Total").should("not.exist");
    });
  });
});
