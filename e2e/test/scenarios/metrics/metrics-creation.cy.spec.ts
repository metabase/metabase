import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { StructuredQuestionDetails } from "e2e/support/helpers";
import {
  startNewMetric,
  createQuestion,
  echartsContainer,
  enterCustomColumnDetails,
  getNotebookStep,
  modal,
  popover,
  restore,
  assertQueryBuilderRowCount,
} from "e2e/support/helpers";

const { ORDERS_ID, ORDERS, PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

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

const ORDER_COUNT_CREATED_AT_DETAILS: QuestionDetails = {
  name: "Orders metric",
  type: "metric",
  query: {
    "source-table": ORDERS_ID,
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
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

const PRODUCT_COUNT_CREATED_AT_DETAILS: QuestionDetails = {
  name: "Products metric",
  type: "metric",
  query: {
    "source-table": PRODUCTS_ID,
    breakout: [["field", PRODUCTS.CREATED_AT, { "temporal-unit": "month" }]],
    aggregation: [["count"]],
  },
  display: "scalar",
};

describe("scenarios > metrics", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  describe("location", () => {
    it("should create a new metric from the homepage", () => {
      cy.visit("/");
      cy.findByTestId("app-bar").findByText("New").click();
      popover().findByText("Metric").click();
      popover().findByText("Raw Data").click();
      popover().findByText("Orders").click();
      addAggregation("Count of rows");
      saveMetric();
      runQuery();
      verifyScalarValue("18,760");
    });
  });

  describe("data source", () => {
    it("should create a metric for a table", () => {
      startNewMetric();
      popover().findByText("Raw Data").click();
      popover().findByText("Orders").click();
      addAggregation("Count of rows");
      saveMetric();
      runQuery();
      verifyScalarValue("18,760");
    });

    it("should create a metric for a saved question", () => {
      startNewMetric();
      popover().findByText("Saved Questions").click();
      popover().findByText("Orders").click();
      addAggregation("Count of rows");
      saveMetric();
      runQuery();
      verifyScalarValue("18,760");
    });

    it("should create a metric for a model", () => {
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
      startNewMetric();
      popover().findByText("Raw Data").click();
      popover().findByText("Products").click();
      startNewJoin();
      popover().findByText("Orders").click();
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

    it("should suggest join conditions when joining metrics with breakout clauses", () => {
      createQuestion(ORDER_COUNT_CREATED_AT_DETAILS);
      createQuestion(PRODUCT_COUNT_CREATED_AT_DETAILS);
      startNewMetric();
      popover().findByText("Metrics").click();
      popover().findByText(ORDER_COUNT_CREATED_AT_DETAILS.name).click();
      startNewJoin();
      popover().within(() => {
        cy.findByText("Sample Database").click();
        cy.findByText("Raw Data").click();
        cy.findByText("Metrics").click();
        cy.findByText(PRODUCT_COUNT_CREATED_AT_DETAILS.name).click();
      });
      getNotebookStep("summarize").within(() => {
        cy.findByText(ORDER_COUNT_CREATED_AT_DETAILS.name).should("be.visible");
        cy.findByText(PRODUCT_COUNT_CREATED_AT_DETAILS.name).should(
          "be.visible",
        );
      });
    });
  });

  describe("custom columns", () => {
    it.skip("should be able to use custom columns in metric queries (metabase#42360)", () => {
      startNewMetric();
      popover().findByText("Raw Data").click();
      popover().findByText("Orders").click();
      startNewCustomColumn();
      enterCustomColumnDetails({
        formula: "[Total] / 2",
        name: "Total2",
      });
      popover().button("Done").click();
      addAggregation("Sum of ...", "Total2");
      saveMetric();
      runQuery();
      verifyScalarValue("755,310.84");
    });
  });

  describe("breakouts", () => {
    it("should create a timeseries metric", () => {
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

    it.skip("should create a metric with a custom aggregation expression based on 2 metrics (metabase#42253)", () => {
      createQuestion(ORDER_COUNT_DETAILS);
      createQuestion(PRODUCT_COUNT_DETAILS);
      startNewMetric();
      popover().findByText("Metrics").click();
      popover().findByText(ORDER_COUNT_DETAILS.name).click();
      startNewJoin();
      popover().within(() => {
        cy.findByText("Sample Database").click();
        cy.findByText("Raw Data").click();
        cy.findByText("Metrics").click();
        cy.findByText(PRODUCT_COUNT_DETAILS.name).click();
      });
      getNotebookStep("summarize").findByText(ORDER_COUNT_DETAILS.name).click();
      enterCustomColumnDetails({
        formula: `[${ORDER_COUNT_DETAILS.name}] / [${PRODUCT_COUNT_DETAILS.name}]`,
        name: "",
      });
      popover().button("Update").click();
      saveMetric();
      runQuery();
      // FIXME put correct value verifyScalarValue("9,380");
    });
  });

  describe("order by", () => {
    it.skip("should add an order by clause to a metric query  (metabase#42416)", () => {
      startNewMetric();
      popover().findByText("Raw Data").click();
      popover().findByText("Orders").click();
      addAggregation("Count of rows");
      addBreakoutWithBucket("Created At", "Year");
      addOrderBy("Count");
      saveMetric();
      runQuery();
      cy.findByTestId("view-footer").findByLabelText("Switch to data").click();
      cy.get("#main-data-grid")
        .findAllByRole("gridcell")
        .last()
        .should("contain.text", "6,578");
    });
  });

  describe("limit", () => {
    it.skip("should add a limit clause to a metric query (metabase#42416)", () => {
      const limit = 5;
      startNewMetric();
      popover().findByText("Raw Data").click();
      popover().findByText("Orders").click();
      addAggregation("Count of rows");
      addBreakout("Created At");
      addLimit(limit);
      saveMetric();
      runQuery();
      assertQueryBuilderRowCount(limit);
    });
  });
});

function startNewClause() {
  cy.findAllByTestId("notebook-cell-item").last().click();
}

function startNewJoin() {
  cy.findAllByTestId("action-buttons").first().button("Join data").click();
}

function startNewCustomColumn() {
  cy.findAllByTestId("action-buttons").first().button("Custom column").click();
}

function startNewFilter() {
  getNotebookStep("filter").within(() => startNewClause());
}

function startNewAggregation() {
  getNotebookStep("summarize")
    .findByTestId("aggregate-step")
    .within(() => startNewClause());
}

function startNewBreakout() {
  getNotebookStep("summarize")
    .findByTestId("breakout-step")
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

function addBreakout(columnName: string) {
  startNewBreakout();
  popover().findByText(columnName).click();
}

function addBreakoutWithBucket(columnName: string, bucketName: string) {
  startNewBreakout();
  popover().findByLabelText(columnName).findByText("by month").click();
  popover().last().findByText(bucketName).click();
}

function addOrderBy(columnName: string) {
  cy.button("Sort").click();
  popover().findByText(columnName).click();
}

function addLimit(limit: number) {
  cy.button("Row limit").click();
  getNotebookStep("limit")
    .findByPlaceholderText("Enter a limit")
    .type(String(limit));
}

function saveMetric() {
  cy.intercept("POST", "/api/card").as("createCard");
  cy.button("Save").click();
  modal().button("Save").click();
  cy.wait("@createCard");
}

function runQuery() {
  cy.intercept("POST", "/api/dataset").as("dataset");
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
