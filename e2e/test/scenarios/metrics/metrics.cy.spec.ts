import {
  echartsContainer,
  getNotebookStep,
  modal,
  popover,
  restore,
} from "e2e/support/helpers";

describe("scenarios > metrics", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/card").as("createCard");
  });

  describe("data source", () => {
    it("should create a metric for a table", () => {
      cy.visit("/");
      startNewMetric();
      popover().findByText("Raw Data").click();
      popover().findByText("Orders").click();
      addAggregation("Count of rows");
      saveMetric();
      runQuery();
      verifyScalarValue("18,760");
    });

    it("should create a metric for a saved question", () => {
      cy.visit("/");
      startNewMetric();
      popover().findByText("Saved Questions").click();
      popover().findByText("Orders").click();
      addAggregation("Count of rows");
      saveMetric();
      runQuery();
      verifyScalarValue("18,760");
    });

    it("should create a metric for a model", () => {
      cy.visit("/");
      startNewMetric();
      popover().findByText("Models").click();
      popover().findByText("Orders Model").click();
      addAggregation("Count of rows");
      saveMetric();
      runQuery();
      verifyScalarValue("18,760");
    });
  });

  describe("breakouts", () => {
    it("should create a timeseries metric", () => {
      cy.visit("/");
      startNewMetric();
      popover().findByText("Raw Data").click();
      popover().findByText("Orders").click();
      addAggregation("Sum of ...", "Total");
      addBreakout("Created At");
      saveMetric();
      runQuery();
      echartsContainer().within(() => {
        cy.findByText("Sum of Total").should("be.visible");
        cy.findByText("Created At").should("be.visible");
      });
    });

    it("should create a geo metric", () => {
      cy.visit("/");
      startNewMetric();
      popover().findByText("Raw Data").click();
      popover().findByText("People").click();
      addAggregation("Count of rows");
      addBreakout("Latitude");
      addBreakout("Longitude");
      saveMetric();
      runQuery();
      cy.get("[data-element-id=pin-map]").should("exist");
    });
  });
});

function startNewMetric() {
  cy.findByTestId("app-bar").findByText("New").click();
  popover().findByText("Metric").click();
}

function addAggregation(operatorName: string, columnName?: string) {
  getNotebookStep("summarize")
    .findByTestId("aggregate-step")
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

function saveMetric() {
  cy.button("Save").click();
  modal().button("Save").click();
  cy.wait("@createCard");
}

function runQuery() {
  cy.findAllByTestId("run-button").last().click();
  cy.wait("@dataset");
}

function verifyScalarValue(value: string) {
  cy.findByTestId("scalar-container").findByText(value).should("be.visible");
}
