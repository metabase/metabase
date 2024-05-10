import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { StructuredQuestionDetails } from "e2e/support/helpers";
import {
  assertQueryBuilderRowCount,
  createQuestion,
  echartsContainer,
  enterCustomColumnDetails,
  getNotebookStep,
  modal,
  popover,
  restore,
  startNewMetric,
  startNewQuestion,
  visualize,
} from "e2e/support/helpers";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

type QuestionDetails = StructuredQuestionDetails & { name: string };

const ORDERS_COUNT_METRIC: QuestionDetails = {
  name: "Orders metric",
  type: "metric",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
  display: "scalar",
};

const ORDERS_COUNT_FILTER_METRIC: QuestionDetails = {
  name: "Orders metric",
  type: "metric",
  query: {
    "source-table": ORDERS_ID,
    filter: [">", ["field", ORDERS.TOTAL, null], 100],
    aggregation: [["count"]],
  },
  display: "scalar",
};

const MULTI_STAGE_METRIC: QuestionDetails = {
  name: "Orders metric",
  type: "metric",
  query: {
    "source-query": {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [
        [
          "field",
          ORDERS.CREATED_AT,
          { "base-type": "type/DateTime", "temporal-unit": "month" },
        ],
      ],
    },
    filter: [">", ["field", "count", { "base-type": "type/Integer" }], 10],
    aggregation: [["count"]],
  },
  display: "scalar",
};

const MULTI_STAGE_QUESTION: QuestionDetails = {
  name: "Multi-stage orders",
  type: "question",
  query: {
    "source-query": {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [
        [
          "field",
          ORDERS.CREATED_AT,
          { "base-type": "type/DateTime", "temporal-unit": "month" },
        ],
      ],
    },
    filter: [">", ["field", "count", { "base-type": "type/Integer" }], 10],
  },
  display: "table",
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
    it("should create a metric based on a table", () => {
      startNewMetric();
      popover().findByText("Raw Data").click();
      popover().findByText("Orders").click();
      addStringCategoryFilter({
        tableName: "Product",
        columnName: "Category",
        values: ["Gadget"],
      });
      addAggregation({ operatorName: "Count of rows" });
      saveMetric();
      runQuery();
      verifyScalarValue("4,939");
    });

    it("should create a metric based on a saved question", () => {
      startNewMetric();
      popover().findByText("Saved Questions").click();
      popover().findByText("Orders").click();
      addStringCategoryFilter({
        tableName: "Product",
        columnName: "Category",
        values: ["Gadget"],
      });
      addAggregation({ operatorName: "Count of rows" });
      saveMetric();
      runQuery();
      verifyScalarValue("4,939");
    });

    it("should create a metric based on a multi-stage saved question", () => {
      createQuestion(MULTI_STAGE_QUESTION);
      startNewMetric();
      popover().findByText("Saved Questions").click();
      popover().findByText(MULTI_STAGE_QUESTION.name).click();
      addNumberBetweenFilter({
        columnName: "Count",
        minValue: 5,
        maxValue: 100,
      });
      addAggregation({ operatorName: "Count of rows" });
      saveMetric();
      runQuery();
      verifyScalarValue("5");
    });

    it("should create a metric based on a model", () => {
      startNewMetric();
      popover().findByText("Models").click();
      popover().findByText("Orders Model").click();
      addStringCategoryFilter({
        tableName: "Product",
        columnName: "Category",
        values: ["Gadget"],
      });
      addAggregation({ operatorName: "Count of rows" });
      saveMetric();
      runQuery();
      verifyScalarValue("4,939");
    });

    it("should create a metric based on a multi-stage model", () => {
      createQuestion({ ...MULTI_STAGE_QUESTION, type: "model" });
      startNewMetric();
      popover().findByText("Models").click();
      popover().findByText(MULTI_STAGE_QUESTION.name).click();
      addNumberBetweenFilter({
        columnName: "Count",
        minValue: 5,
        maxValue: 100,
      });
      addAggregation({ operatorName: "Count of rows" });
      saveMetric();
      runQuery();
      verifyScalarValue("5");
    });

    it("should create a metric based on a single-stage metric", () => {
      createQuestion(ORDERS_COUNT_METRIC);
      startNewMetric();
      popover().findByText("Metrics").click();
      popover().findByText(ORDERS_COUNT_METRIC.name).click();
      addStringCategoryFilter({
        tableName: "Product",
        columnName: "Category",
        values: ["Gadget"],
      });
      saveMetric();
      runQuery();
      verifyScalarValue("4,939");
    });

    it("should create a metric based on a multi-stage metric", () => {
      createQuestion(MULTI_STAGE_METRIC);
      startNewMetric();
      popover().findByText("Metrics").click();
      popover().findByText(MULTI_STAGE_METRIC.name).click();
      addDateBetweenFilter({
        columnName: "Created At: Month",
        minValue: "May 7, 2020",
        maxValue: "October 20, 2022",
      });
      saveMetric();
      runQuery();
      verifyScalarValue("6");
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

    it("should not be possible to join a metric", () => {
      createQuestion(ORDERS_COUNT_METRIC);
      startNewMetric();
      popover().findByText("Raw Data").click();
      popover().findByText("Orders").click();
      startNewJoin();
      popover().within(() => {
        cy.findByText("Sample Database").click();
        cy.findByText("Raw Data").click();
        cy.findByText("Raw Data").should("be.visible");
        cy.findByText("Saved Questions").should("be.visible");
        cy.findByText("Models").should("be.visible");
        cy.findByText("Metrics").should("not.exist");
      });
    });

    it("should not be possible to join data on the first stage of a metric-based query", () => {
      createQuestion(ORDERS_COUNT_METRIC);
      startNewQuestion();
      popover().findByText("Metrics").click();
      popover().findByText(ORDERS_COUNT_METRIC.name).click();
      getNotebookStep("data").within(() => {
        getActionButton("Custom column").should("be.visible");
        getActionButton("Join data").should("not.exist");
      });
    });

    it("should join on the second stage of a metric query", () => {
      createQuestion(ORDERS_COUNT_METRIC);
      startNewQuestion();
      popover().findByText("Metrics").click();
      popover().findByText(ORDERS_COUNT_METRIC.name).click();
      addBreakout({ columnName: "Product ID" });
      startNewJoin({ isPostAggregation: true });
      popover().findByText("Products").click();
      getNotebookStep("join", { stage: 1 }).within(() => {
        cy.findByText("ID").should("be.visible");
        cy.findByText("Product ID").should("be.visible");
      });
      visualize();
      assertQueryBuilderRowCount(200);
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

    it("should open the expression editor automatically when the source metric is already used in an aggregation expression", () => {
      createQuestion(ORDERS_COUNT_METRIC);
      startNewMetric();
      popover().findByText("Metrics").click();
      popover().findByText(ORDERS_COUNT_METRIC.name).click();
      startNewAggregation();
      cy.findByTestId("expression-editor").should("be.visible");
    });
  });

  describe("filters", () => {
    it("should add a filter to a metric based on a metric with a filter", () => {
      createQuestion(ORDERS_COUNT_FILTER_METRIC);
      startNewMetric();
      popover().findByText("Metrics").click();
      popover().findByText(ORDERS_COUNT_FILTER_METRIC.name).click();
      addStringCategoryFilter({
        tableName: "Product",
        columnName: "Category",
        values: ["Widget"],
      });
      saveMetric();
      runQuery();
      verifyScalarValue("1,652");
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

    it("should create a geo metric with multiple breakouts", () => {
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
      createQuestion(ORDERS_COUNT_METRIC);
      startNewMetric();
      popover().findByText("Metrics").click();
      popover().findByText(ORDERS_COUNT_METRIC.name).click();
      getNotebookStep("summarize").findByText(ORDERS_COUNT_METRIC.name).click();
      enterCustomColumnDetails({
        formula: `[${ORDERS_COUNT_METRIC.name}] / 2`,
        name: "",
      });
      popover().button("Update").click();
      saveMetric();
      runQuery();
      verifyScalarValue("9,380");
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

    it("should add multiple aggregation columns in the first stage of a metric query", () => {
      startNewMetric();
      popover().findByText("Raw Data").click();
      popover().findByText("Orders").click();
      addAggregation({ operatorName: "Sum of ...", columnName: "Total" });
      addAggregation({ operatorName: "Sum of ...", columnName: "Subtotal" });
      addBreakout({ columnName: "Created At" });
      addAggregation({
        operatorName: "Average of ...",
        columnName: "Sum of Subtotal",
        isPostAggregation: true,
      });
      saveMetric();
      runQuery();
      verifyScalarValue("29,554.86");
    });
  });
});

function getActionButton(title: string) {
  return cy.findByTestId("action-buttons").button(title);
}

function getPlusButton() {
  return cy.findAllByTestId("notebook-cell-item").last();
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
      getActionButton("Join data").click(),
    );
  } else {
    getNotebookStep("data", { stage: stageIndex }).within(() =>
      getActionButton("Join data").click(),
    );
  }
}

function startNewCustomColumn({
  stageIndex,
  isPostAggregation,
}: StartNewClauseOpts = {}) {
  if (isPostAggregation) {
    getNotebookStep("summarize", { stage: stageIndex }).within(() =>
      getActionButton("Custom column").click(),
    );
  } else {
    getNotebookStep("data", { stage: stageIndex }).within(() =>
      getActionButton("Custom column").click(),
    );
  }
}

function startNewFilter({
  stageIndex,
  isPostAggregation,
}: StartNewClauseOpts = {}) {
  if (isPostAggregation) {
    getNotebookStep("summarize", { stage: stageIndex }).within(() =>
      getActionButton("Filter").click(),
    );
  } else {
    getNotebookStep("filter", { stage: stageIndex }).within(() =>
      getPlusButton().click(),
    );
  }
}

function startNewAggregation({
  stageIndex,
  isPostAggregation,
}: StartNewClauseOpts = {}) {
  if (isPostAggregation) {
    getNotebookStep("summarize", { stage: stageIndex }).within(() =>
      getActionButton("Summarize").click(),
    );
  } else {
    getNotebookStep("summarize", { stage: stageIndex })
      .findByTestId("aggregate-step")
      .within(() => getPlusButton().click());
  }
}

function startNewBreakout({ stageIndex }: StartNewClauseOpts = {}) {
  getNotebookStep("summarize", { stage: stageIndex })
    .findByTestId("breakout-step")
    .within(() => getPlusButton().click());
}

function addStringCategoryFilter({
  tableName,
  columnName,
  values,
}: {
  tableName?: string;
  columnName: string;
  values: string[];
}) {
  startNewFilter();
  popover().within(() => {
    if (tableName) {
      cy.findByText(tableName).click();
    }
    cy.findByText(columnName).click();
    values.forEach(value => cy.findByText(value).click());
    cy.button("Add filter").click();
  });
}

function addNumberBetweenFilter({
  tableName,
  columnName,
  minValue,
  maxValue,
}: {
  tableName?: string;
  columnName: string;
  minValue: number;
  maxValue: number;
}) {
  startNewFilter();
  popover().within(() => {
    if (tableName) {
      cy.findByText(tableName).click();
    }
    cy.findByText(columnName).click();
    cy.findByPlaceholderText("Min").type(String(minValue));
    cy.findByPlaceholderText("Max").type(String(maxValue));
    cy.button("Add filter").click();
  });
}

function addDateBetweenFilter({
  tableName,
  columnName,
  minValue,
  maxValue,
}: {
  tableName?: string;
  columnName: string;
  minValue: string;
  maxValue: string;
}) {
  startNewFilter();
  popover().within(() => {
    if (tableName) {
      cy.findByText(tableName).click();
    }
    cy.findByText(columnName).click();
    cy.findByText("Specific dates…").click();
    cy.findByLabelText("Start date").clear().type(minValue);
    cy.findByLabelText("End date").clear().type(maxValue);
    cy.button("Add filter").click();
  });
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
