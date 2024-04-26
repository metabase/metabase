import {
  getNotebookStep,
  modal,
  openNotebook,
  openOrdersTable,
  popover,
  queryBuilderHeader,
  restore,
  saveQuestion,
  visualize,
} from "e2e/support/helpers";

describe("issue 40435", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("PUT", "/api/card/*").as("updateCard");
  });

  it("should make new query columns visible by default (metabase#40435)", () => {
    openOrdersTable();
    openNotebook();
    getNotebookStep("data").button("Pick columns").click();
    popover().within(() => {
      cy.findByText("Select none").click();
      cy.findByText("User ID").click();
    });
    getNotebookStep("data").button("Pick columns").click();
    visualize();
    cy.findByTestId("viz-settings-button").click();
    cy.findByTestId("sidebar-left").within(() => {
      cy.findByTestId("ID-hide-button").click();
      cy.findByTestId("ID-show-button").click();
    });
    saveQuestion();

    openNotebook();
    getNotebookStep("data").button("Pick columns").click();
    popover().findByText("Product ID").click();
    queryBuilderHeader().findByText("Save").click();
    modal().last().findByText("Save").click();
    cy.wait("@updateCard");
    visualize();

    cy.findByRole("columnheader", { name: "ID" }).should("be.visible");
    cy.findByRole("columnheader", { name: "User ID" }).should("be.visible");
    cy.findByRole("columnheader", { name: "Product ID" }).should("be.visible");
  });
});
