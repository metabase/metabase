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
      addAggregation("Count of rows");
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
      addAggregation("Sum of ...", "Total");
      addBreakout("Created At");
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
      addAggregation("Count of rows");
      addBreakout("Latitude");
      addBreakout("Longitude");
      cy.button("Save").click();
      modal().button("Save").click();
      cy.wait("@createCard");
      queryBuilderMain().findByTestId("run-button").click();
      cy.wait("@dataset");
      cy.get("[data-element-id=pin-map]").should("exist");
    });
  });
});

function addAggregation(operatorName: string, columnName?: string) {
  getNotebookStep("summarize")
    .findByTestId("aggregation-step")
    .findAllByTestId("notebook-cell-item")
    .last()
    .click();

  popover().within(() => {
    cy.findByText(operatorName).click();
    if (columnName) {
      cy.findByText(columnName).click();
    }
  });
}

function addBreakout(columnName: string) {
  getNotebookStep("summarize")
    .findByTestId("breakout-step")
    .findAllByTestId("notebook-cell-item")
    .last()
    .click();

  popover().findByText(columnName).click();
}
