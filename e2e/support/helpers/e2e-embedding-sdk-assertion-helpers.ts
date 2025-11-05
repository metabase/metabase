import { popover, tableInteractive } from "./e2e-ui-elements-helpers";

export function assertSdkNotebookEditorUsable(root: Cypress.Chainable = cy) {
  cy.findByText("Orders").should("be.visible");

  // Wait until the entity picker modal is visible
  // Using `cy.contains` does not work in the iframe.
  root.contains("Pick your starting data");

  popover().within(() => {
    cy.findByText("Orders").click();
  });

  cy.findByRole("button", { name: "Visualize" }).click();

  // Should not show a loading indicator again as the question has not changed (metabase#47564)
  cy.findByTestId("loading-indicator").should("not.exist");

  // Should show a visualization after clicking "Visualize"
  // and should not show an error message (metabase#55398)
  cy.findByText("Question not found").should("not.exist");
  cy.findByText("110.93").should("be.visible"); // table data
}

export function assertSdkInteractiveQuestionOrdersUsable() {
  cy.findByText("Orders").should("be.visible");

  cy.log("1. shows a table");
  tableInteractive().within(() => {
    cy.findByText("Total").should("be.visible");
    cy.findAllByText("37.65").first().should("be.visible");
  });

  cy.findByTestId("chart-type-selector-button").click();

  cy.log("2. can switch to a trend chart");
  cy.findByRole("menu").within(() => {
    cy.findByText("Trend").click();
  });

  cy.findByText("2000").should("be.visible");
}
