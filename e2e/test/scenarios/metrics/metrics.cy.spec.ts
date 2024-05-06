import { getNotebookStep, modal, popover, restore } from "e2e/support/helpers";

describe("scenarios > metrics", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should create a metric for a table", () => {
    cy.visit("/");
    cy.findByTestId("app-bar").findByText("New").click();
    popover().findByText("Metric").click();
    popover().findByText("Raw Data").click();
    popover().findByText("Orders").click();
    getNotebookStep("summarize")
      .findByText("Pick the metric you want to see")
      .click();
    popover().findByText("Count of rows").click();
    cy.button("Save").click();
    modal().within(() => {
      cy.findByLabelText("Name").clear().type("My metric");
      cy.button("Save").click();
    });
    cy.findByTestId("query-builder-main").icon("play").click();
    cy.findByTestId("saved-question-header-title").should(
      "have.value",
      "My metric",
    );
    cy.findByTestId("scalar-container")
      .findByText("18,760")
      .should("be.visible");
  });
});
