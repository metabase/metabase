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
    popover().findByText("Question").click();
    popover().findByText("Saved Questions").click();
    popover().findByText("Orders with ID").click();
    cy.findByTestId("fields-picker").click();
    popover().findByText("ID").should("be.visible");
    popover().findByText("Total").should("not.exist");

    visualize();
  });
});
