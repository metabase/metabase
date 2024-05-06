import {
  echartsContainer,
  getNotebookStep,
  modal,
  popover,
  queryBuilderMain,
  restore,
} from "e2e/support/helpers";

describe("scenarios > metrics", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/card").as("createCard");
  });

  describe("breakouts", () => {
    it("should create a scalar metric", () => {
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
      modal().button("Save").click();
      cy.wait("@createCard");
      queryBuilderMain().findByTestId("run-button").click();
      cy.wait("@dataset");
      cy.findByTestId("scalar-container")
        .findByText("18,760")
        .should("be.visible");
    });

    it("should create a timeseries metric", () => {
      cy.visit("/");
      cy.findByTestId("app-bar").findByText("New").click();
      popover().findByText("Metric").click();
      popover().findByText("Raw Data").click();
      popover().findByText("Orders").click();
      getNotebookStep("summarize")
        .findByText("Pick the metric you want to see")
        .click();
      popover().within(() => {
        cy.findByText("Sum of ...").click();
        cy.findByText("Total").click();
      });
      getNotebookStep("summarize")
        .findByText("Pick a column to group by")
        .click();
      popover().findByText("Created At").click();
      cy.button("Save").click();
      modal().button("Save").click();
      cy.wait("@createCard");
      queryBuilderMain().findByTestId("run-button").click();
      cy.wait("@dataset");
      echartsContainer().within(() => {
        cy.findByText("Sum of Total").should("be.visible");
        cy.findByText("Created At").should("be.visible");
      });
    });

    it("should create a geo metric", () => {
      cy.visit("/");
      cy.findByTestId("app-bar").findByText("New").click();
      popover().findByText("Metric").click();
      popover().findByText("Raw Data").click();
      popover().findByText("People").click();
      getNotebookStep("summarize")
        .findByText("Pick the metric you want to see")
        .click();
      popover().findByText("Count of rows").click();
      getNotebookStep("summarize")
        .findByText("Pick a column to group by")
        .click();
      popover().findByText("Latitude").click();
      getNotebookStep("summarize")
        .findByTestId("breakout-step")
        .icon("add")
        .click();
      popover().findByText("Longitude").click();
      cy.button("Save").click();
      modal().button("Save").click();
      cy.wait("@createCard");
      queryBuilderMain().findByTestId("run-button").click();
      cy.wait("@dataset");
      cy.get("[data-element-id=pin-map]").should("exist");
    });
  });
});
