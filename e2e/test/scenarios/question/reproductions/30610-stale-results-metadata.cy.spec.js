import {
  modal,
  openNotebook,
  openOrdersTable,
  popover,
  queryBuilderHeader,
  restore,
  saveQuestion,
  visitQuestion,
  visualize,
} from "e2e/support/helpers";
import { ORDERS_QUESTION_ID } from "e2e/support/cypress_sample_instance_data";

describe("issue 30610", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should remove stale metadata when saving a new question (metabase#30610)", () => {
    openOrdersTable();
    openNotebook();
    removeSourceColumns();
    saveQuestion("New orders");
    createAdHocQuestion("New orders");
    visualizeAndAssertColumns();
  });

  it("should remove stale metadata when updating an existing question (metabase#30610)", () => {
    visitQuestion(ORDERS_QUESTION_ID);
    openNotebook();
    removeSourceColumns();
    updateQuestion();
    createAdHocQuestion("Orders");
    visualizeAndAssertColumns();
  });
});

function updateQuestion() {
  queryBuilderHeader().findByText("Save").click();
  modal().button("Save").click();
}

function removeSourceColumns() {
  cy.findByTestId("fields-picker").click();
  popover().findByText("Select none").click();
}

function createAdHocQuestion(questionName) {
  cy.findByTestId("app-bar").findByText("New").click();
  popover().within(() => {
    cy.findByText("Question").click();
    cy.findByText("Saved Questions").click();
    cy.findByText(questionName).click();
  });
  cy.findByTestId("fields-picker").click();
  popover().within(() => {
    cy.findByText("ID").should("be.visible");
    cy.findByText("Total").should("not.exist");
  });
}

function visualizeAndAssertColumns() {
  visualize();
  cy.findByTestId("TableInteractive-root").within(() => {
    cy.findByText("ID").should("exist");
    cy.findByText("Total").should("not.exist");
  });
}
