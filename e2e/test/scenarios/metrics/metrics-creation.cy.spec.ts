import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { StructuredQuestionDetails } from "e2e/support/helpers";
import {
  createQuestion,
  echartsContainer,
  enterCustomColumnDetails,
  getNotebookStep,
  modal,
  popover,
  restore,
} from "e2e/support/helpers";

const { ORDERS_ID, PRODUCTS_ID } = SAMPLE_DATABASE;

type QuestionDetails = StructuredQuestionDetails & { name: string };

const ORDER_COUNT_DETAILS: QuestionDetails = {
  name: "Orders metric",
  type: "metric",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
  display: "scalar",
};

const PRODUCT_COUNT_DETAILS: QuestionDetails = {
  name: "Products metric",
  type: "metric",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
  },
  display: "scalar",
};

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

    it("should create a metric for another metric", () => {
      createQuestion(ORDER_COUNT_DETAILS);
      cy.visit("/");
      startNewMetric();
      popover().findByText("Metrics").click();
      popover().findByText(ORDER_COUNT_DETAILS.name).click();
      saveMetric();
      runQuery();
      verifyScalarValue("18,760");
    });
  });

  describe("joins", () => {
    it("should join a table", () => {
      cy.visit("/");
      startNewMetric();
      popover().findByText("Raw Data").click();
      popover().findByText("Products").click();
      cy.button("Join data").click();
      popover().findByText("Orders").click();
      popover().findByText("ID").click();
      popover().findByText("Product ID").click();
      startNewFilter();
      popover().within(() => {
        cy.findByText("User").click();
        cy.findByText("State").click();
        cy.findByText("CA").click();
        cy.button("Add filter").click();
      });
      addAggregation("Count of rows");
      saveMetric();
      runQuery();
      verifyScalarValue("613");
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
      verifyLineChart("Created At", "Sum of Total");
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
      verifyPinMap();
    });
  });

  describe("aggregations", () => {
    it("should create a metric with a custom aggregation expression based on 1 metric", () => {
      createQuestion(ORDER_COUNT_DETAILS);
      cy.visit("/");
      startNewMetric();
      popover().findByText("Metrics").click();
      popover().findByText(ORDER_COUNT_DETAILS.name).click();
      getNotebookStep("summarize").findByText(ORDER_COUNT_DETAILS.name).click();
      enterCustomColumnDetails({
        formula: `[${ORDER_COUNT_DETAILS.name}] / 2`,
        name: "",
      });
      popover().button("Update").click();
      saveMetric();
      runQuery();
      verifyScalarValue("9,380");
    });

    it("should create a metric with a custom aggregation expression based on 2 metrics", () => {
      createQuestion(ORDER_COUNT_DETAILS);
      createQuestion(PRODUCT_COUNT_DETAILS);
      cy.visit("/");
      startNewMetric();
      popover().findByText("Metrics").click();
      popover().findByText(ORDER_COUNT_DETAILS.name).click();
      cy.button("Join data").click();
      popover().within(() => {
        cy.findByText("Sample Database").click();
        cy.findByText("Raw Data").click();
        cy.findByText("Metrics").click();
        cy.findByText(PRODUCT_COUNT_DETAILS.name).click();
      });
      popover().findByText("Product ID").click();
      popover().findByText("ID").click();
      getNotebookStep("summarize").findByText(ORDER_COUNT_DETAILS.name).click();
      enterCustomColumnDetails({
        formula: `[${ORDER_COUNT_DETAILS.name}] / [${PRODUCT_COUNT_DETAILS.name}]`,
        name: "",
      });
      popover().button("Update").click();
      saveMetric();
      runQuery();
      verifyScalarValue("9,380");
    });
  });
});

function startNewMetric() {
  cy.findByTestId("app-bar").findByText("New").click();
  popover().findByText("Metric").click();
}

function startNewClause() {
  cy.findAllByTestId("notebook-cell-item").last().click();
}

function startNewFilter() {
  getNotebookStep("filter").within(() => startNewClause());
}

function startNewAggregation() {
  getNotebookStep("summarize")
    .findByTestId("aggregate-step")
    .within(() => startNewClause());
}

function addAggregation(operatorName: string, columnName?: string) {
  startNewAggregation();

  popover().within(() => {
    cy.findByText(operatorName).click();
    if (columnName) {
      cy.findByText(columnName).click();
    }
  });
}

function startNewBreakout() {
  getNotebookStep("summarize")
    .findByTestId("breakout-step")
    .within(() => startNewClause());
}

function addBreakout(columnName: string) {
  startNewBreakout();
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

function verifyLineChart(xAxis: string, yAxis: string) {
  echartsContainer().within(() => {
    cy.findByText(yAxis).should("be.visible");
    cy.findByText(xAxis).should("be.visible");
  });
}

function verifyPinMap() {
  cy.get("[data-element-id=pin-map]").should("exist");
}
