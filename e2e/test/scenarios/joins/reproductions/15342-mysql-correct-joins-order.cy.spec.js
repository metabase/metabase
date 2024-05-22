import {
  entityPickerModal,
  entityPickerModalTab,
  getNotebookStep,
  popover,
  restore,
  startNewQuestion,
  visualize,
} from "e2e/support/helpers";

const MYSQL_DB_NAME = "QA MySQL8";

describe("issue 15342", { tags: "@external" }, () => {
  beforeEach(() => {
    restore("mysql-8");
    cy.signInAsAdmin();

    cy.viewport(4000, 1200); // huge width required so three joined tables can fit
  });

  it("should correctly order joins for MySQL queries (metabase#15342)", () => {
    startNewQuestion();
    entityPickerModal().within(() => {
      entityPickerModalTab("Tables").click();
      cy.findByText(MYSQL_DB_NAME).click();
      cy.findByText("People").click();
    });

    cy.icon("join_left_outer").click();
    entityPickerModal().findByText("Orders").click();
    getNotebookStep("join").findByLabelText("Right column").click();
    popover().findByText("Product ID").click();

    cy.icon("join_left_outer").last().click();
    entityPickerModal().findByText("Products").click();
    getNotebookStep("join").icon("join_left_outer").click();
    popover().findByText("Inner join").click();

    visualize();

    cy.findByTestId("query-visualization-root").within(() => {
      cy.findByText("Email"); // from People table
      cy.findByText("Orders → ID"); // joined Orders table columns
      cy.findByText("Products → ID"); // joined Products table columns
    });
  });
});
