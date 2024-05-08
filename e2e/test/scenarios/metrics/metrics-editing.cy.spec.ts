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
      addAggregation({ operatorName: "Count of rows" });
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
      addAggregation({ operatorName: "Count of rows" });
      saveMetric();
      runQuery();
      verifyScalarValue("18,760");
    });

    it("should create a metric for a saved question", () => {
      startNewMetric();
      popover().findByText("Saved Questions").click();
      popover().findByText("Orders").click();
      addAggregation({ operatorName: "Count of rows" });
      saveMetric();
      runQuery();
      verifyScalarValue("18,760");
    });

    it("should create a metric for a model", () => {
      startNewMetric();
      popover().findByText("Models").click();
      popover().findByText("Orders Model").click();
      addAggregation({ operatorName: "Count of rows" });
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
      addAggregation({ operatorName: "Count of rows" });
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
      addAggregation({ operatorName: "Sum of ...", columnName: "Total2" });
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
      addAggregation({ operatorName: "Sum of ...", columnName: "Total" });
      addBreakout({ columnName: "Created At" });
      saveMetric();
      runQuery();
      verifyLineChart({ xAxis: "Created At", yAxis: "Sum of Total" });
    });

    it("should create a geo metric", () => {
      startNewMetric();
      popover().findByText("Raw Data").click();
      popover().findByText("People").click();
      addAggregation({ operatorName: "Count of rows" });
      addBreakout({ columnName: "Latitude" });
      addBreakout({ columnName: "Longitude" });
      saveMetric();
      runQuery();
      verifyPinMap();
    });

    it("should add a breakout clause in a metric query with 2 stages", () => {
      startNewMetric();
      popover().findByText("Raw Data").click();
      popover().findByText("Orders").click();
      addAggregation({ operatorName: "Count of rows" });
      addBreakout({ columnName: "Created At" });
      addAggregation({
        operatorName: "Average of ...",
        columnName: "Count",
        isPostAggregation: true,
      });
      addBreakout({
        columnName: "Created At: Month",
        bucketName: "Year",
        stageIndex: 1,
      });
      saveMetric();
      runQuery();
      verifyLineChart({ xAxis: "Created At", yAxis: "Average of Count" });
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

    it("should add an aggregation clause in a metric query with 2 stages", () => {
      startNewMetric();
      popover().findByText("Raw Data").click();
      popover().findByText("Orders").click();
      addAggregation({ operatorName: "Count of rows" });
      addBreakout({ columnName: "Created At", bucketName: "Year" });
      addAggregation({
        operatorName: "Count of rows",
        isPostAggregation: true,
      });
      saveMetric();
      runQuery();
      verifyScalarValue("5");
    });
  });

  describe("order by", () => {
    it.skip("should add an order by clause to a metric query  (metabase#42416)", () => {
      startNewMetric();
      popover().findByText("Raw Data").click();
      popover().findByText("Orders").click();
      addAggregation({ operatorName: "Count of rows" });
      addBreakout({ columnName: "Created At", bucketName: "Year" });
      addOrderBy({ columnName: "Count" });
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
      addAggregation({ operatorName: "Count of rows" });
      addBreakout({ columnName: "Created At" });
      addLimit({ limit });
      saveMetric();
      runQuery();
      assertQueryBuilderRowCount(limit);
    });
  });
});

function clickActionButton(title: string) {
  cy.findByTestId("action-buttons").button(title).click();
}

function clickAddClauseButton() {
  cy.findAllByTestId("notebook-cell-item").last().click();
}

interface StartNewClauseOpts {
  stageIndex?: number;
  isPostAggregation?: boolean;
}

function startNewJoin({
  stageIndex,
  isPostAggregation,
}: StartNewClauseOpts = {}) {
  if (isPostAggregation) {
    getNotebookStep("summarize", { stage: stageIndex }).within(() =>
      clickActionButton("Join data"),
    );
  } else {
    getNotebookStep("data", { stage: stageIndex }).within(() =>
      clickActionButton("Join data"),
    );
  }
}

function startNewCustomColumn({
  stageIndex,
  isPostAggregation,
}: StartNewClauseOpts = {}) {
  if (isPostAggregation) {
    getNotebookStep("summarize", { stage: stageIndex }).within(() =>
      clickActionButton("Custom column"),
    );
  } else {
    getNotebookStep("data", { stage: stageIndex }).within(() =>
      clickActionButton("Custom column"),
    );
  }
}

function startNewFilter({
  stageIndex,
  isPostAggregation,
}: StartNewClauseOpts = {}) {
  if (isPostAggregation) {
    getNotebookStep("summarize", { stage: stageIndex }).within(() =>
      clickActionButton("Filter (optional)"),
    );
  } else {
    getNotebookStep("filter", { stage: stageIndex }).within(() =>
      clickAddClauseButton(),
    );
  }
}

function startNewAggregation({
  stageIndex,
  isPostAggregation,
}: StartNewClauseOpts = {}) {
  if (isPostAggregation) {
    getNotebookStep("summarize", { stage: stageIndex }).within(() =>
      clickActionButton("Measure calculation"),
    );
  } else {
    getNotebookStep("summarize", { stage: stageIndex })
      .findByTestId("aggregate-step")
      .within(() => clickAddClauseButton());
  }
}

function startNewBreakout({ stageIndex }: StartNewClauseOpts = {}) {
  getNotebookStep("summarize", { stage: stageIndex })
    .findByTestId("breakout-step")
    .within(() => clickAddClauseButton());
}

function addAggregation({
  operatorName,
  columnName,
  stageIndex,
  isPostAggregation,
}: {
  operatorName: string;
  columnName?: string;
  stageIndex?: number;
  isPostAggregation?: boolean;
}) {
  startNewAggregation({ stageIndex, isPostAggregation });

  popover().within(() => {
    cy.findByText(operatorName).click();
    if (columnName) {
      cy.findByText(columnName).click();
    }
  });
}

function addBreakout({
  columnName,
  bucketName,
  stageIndex,
}: {
  columnName: string;
  bucketName?: string;
  stageIndex?: number;
}) {
  startNewBreakout({ stageIndex });
  if (bucketName) {
    popover().findByLabelText(columnName).findByText("by month").click();
    popover().last().findByText(bucketName).click();
  } else {
    popover().findByText(columnName).click();
  }
}

function addOrderBy({
  columnName,
  stageIndex,
}: {
  columnName: string;
  stageIndex?: number;
}) {
  getNotebookStep("summarize", { stage: stageIndex }).within(() =>
    clickActionButton("Sort"),
  );
  popover().findByText(columnName).click();
}

function addLimit({
  limit,
  stageIndex,
}: {
  limit: number;
  stageIndex?: number;
}) {
  getNotebookStep("summarize", { stage: stageIndex }).within(() =>
    clickActionButton("Limit"),
  );
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

function verifyLineChart({ xAxis, yAxis }: { xAxis: string; yAxis: string }) {
  echartsContainer().within(() => {
    cy.findByText(yAxis).should("be.visible");
    cy.findByText(xAxis).should("be.visible");
  });
}

function verifyPinMap() {
  cy.get("[data-element-id=pin-map]").should("exist");
}
