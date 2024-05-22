import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_MODEL_ID } from "e2e/support/cypress_sample_instance_data";
import {
  assertQueryBuilderRowCount,
  createQuestion,
  echartsContainer,
  enterCustomColumnDetails,
  entityPickerModal,
  entityPickerModalTab,
  getNotebookStep,
  modal,
  openQuestionActions,
  popover,
  queryBuilderHeader,
  restore,
  startNewMetric,
  startNewQuestion,
  visitMetric,
  visualize,
} from "e2e/support/helpers";

const { ORDERS_ID, ORDERS, PRODUCTS_ID } = SAMPLE_DATABASE;

const ORDERS_SCALAR_METRIC = {
  name: "Orders metric",
  type: "metric",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
  display: "scalar",
};

const ORDERS_SCALAR_MODEL_METRIC = {
  name: "Orders model metric",
  type: "metric",
  query: {
    "source-table": `card__${ORDERS_MODEL_ID}`,
    aggregation: [["count"]],
  },
  display: "scalar",
};

const ORDERS_SCALAR_FILTER_METRIC = {
  name: "Orders metric with filter",
  type: "metric",
  query: {
    "source-table": ORDERS_ID,
    filter: [">", ["field", ORDERS.TOTAL, null], 100],
    aggregation: [["count"]],
  },
  display: "scalar",
};

const PRODUCTS_SCALAR_METRIC = {
  name: "Products metric",
  type: "metric",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
  },
  display: "scalar",
};

const ORDERS_MULTI_STAGE_METRIC = {
  name: "Orders metric mutli-stage",
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

const ORDERS_MULTI_STAGE_QUESTION = {
  name: "Orders question multi-stage",
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

describe("scenarios > metrics > editing", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  describe("organization", () => {
    it("should be able to create a new metric from the homepage", () => {
      cy.visit("/");
      cy.findByTestId("app-bar").findByText("New").click();
      popover().findByText("Metric").click();
      entityPickerModal().within(() => {
        entityPickerModalTab("Tables").click();
        cy.findByText("Orders").click();
      });
      addAggregation({ operatorName: "Count of rows" });
      saveMetric();
      runQuery();
      verifyScalarValue("18,760");
    });

    it("should be able to rename a metric", () => {
      const newTitle = "New metric name";
      createQuestion(ORDERS_SCALAR_METRIC).then(({ body: card }) => {
        visitMetric(card.id);
        renameMetric(newTitle);
        visitMetric(card.id);
        queryBuilderHeader().findByDisplayValue(newTitle).should("be.visible");
      });
    });

    it("should be able to change the query definition of a metric", () => {
      createQuestion(ORDERS_SCALAR_METRIC).then(({ body: card }) =>
        visitMetric(card.id),
      );
      openQuestionActions();
      popover().findByText("Edit metric definition").click();
      addBreakout({ tableName: "Product", columnName: "Category" });
      updateMetric();
      verifyLineAreaBarChart({ xAxis: "Product → Category", yAxis: "Count" });
    });

    it("should be able to change the query definition of a metric based on a model", () => {
      createQuestion(ORDERS_SCALAR_MODEL_METRIC).then(({ body: card }) =>
        visitMetric(card.id),
      );
      openQuestionActions();
      popover().findByText("Edit metric definition").click();
      addBreakout({ tableName: "Product", columnName: "Category" });
      updateMetric();
      verifyLineAreaBarChart({ xAxis: "Product → Category", yAxis: "Count" });
    });

    it("should pin new metrics automatically", () => {
      cy.visit("/");
      cy.findByTestId("app-bar").findByText("New").click();
      popover().findByText("Metric").click();
      entityPickerModal().within(() => {
        entityPickerModalTab("Tables").click();
        cy.findByText("Orders").click();
      });
      addAggregation({ operatorName: "Count of rows" });
      saveMetric({ name: "New metric" });

      cy.findByTestId("head-crumbs-container")
        .findByText("Our analytics")
        .click();
      cy.findByTestId("pinned-items").within(() => {
        cy.findByText("Metrics").should("be.visible");
        cy.findByText("New metric").should("be.visible");
        verifyScalarValue("18,760");
      });
    });
  });

  describe("data source", () => {
    it("should create a metric based on a table", () => {
      startNewMetric();
      entityPickerModal().within(() => {
        entityPickerModalTab("Tables").click();
        cy.findByText("Orders").click();
      });
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
      entityPickerModal().within(() => {
        entityPickerModalTab("Saved questions").click();
        cy.findByText("Orders").click();
      });
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
      createQuestion(ORDERS_MULTI_STAGE_QUESTION);
      startNewMetric();
      entityPickerModal().within(() => {
        entityPickerModalTab("Saved questions").click();
        cy.findByText(ORDERS_MULTI_STAGE_QUESTION.name).click();
      });
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
      entityPickerModal().within(() => {
        entityPickerModalTab("Models").click();
        cy.findByText("Orders Model").click();
      });
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
      createQuestion({ ...ORDERS_MULTI_STAGE_QUESTION, type: "model" });
      startNewMetric();
      entityPickerModal().within(() => {
        entityPickerModalTab("Models").click();
        cy.findByText(ORDERS_MULTI_STAGE_QUESTION.name).click();
      });
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
      createQuestion(ORDERS_SCALAR_METRIC);
      startNewMetric();
      entityPickerModal().within(() => {
        entityPickerModalTab("Metrics").click();
        cy.findByText(ORDERS_SCALAR_METRIC.name).click();
      });
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
      createQuestion(ORDERS_MULTI_STAGE_METRIC);
      startNewMetric();
      entityPickerModal().within(() => {
        entityPickerModalTab("Metrics").click();
        cy.findByText(ORDERS_MULTI_STAGE_METRIC.name).click();
      });
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
      entityPickerModal().within(() => {
        entityPickerModalTab("Tables").click();
        cy.findByText("Products").click();
      });
      startNewJoin();
      entityPickerModal().within(() => {
        entityPickerModalTab("Tables").click();
        cy.findByText("Orders").click();
      });
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
      createQuestion(ORDERS_SCALAR_METRIC);
      startNewMetric();
      entityPickerModal().within(() => {
        entityPickerModalTab("Tables").click();
        cy.findByText("Orders").click();
      });
      startNewJoin();
      entityPickerModal().within(() => {
        entityPickerModalTab("Tables").should("be.visible");
        entityPickerModalTab("Metrics").should("not.exist");
      });
    });

    it("should not be possible to join data on the first stage of a metric-based query", () => {
      createQuestion(ORDERS_SCALAR_METRIC);
      startNewQuestion();
      entityPickerModal().within(() => {
        entityPickerModalTab("Metrics").click();
        cy.findByText(ORDERS_SCALAR_METRIC.name).click();
      });
      getNotebookStep("data").within(() => {
        getActionButton("Custom column").should("be.visible");
        getActionButton("Join data").should("not.exist");
      });
    });

    it("should join on the second stage of a metric query", () => {
      createQuestion(ORDERS_SCALAR_METRIC);
      startNewQuestion();
      entityPickerModal().within(() => {
        entityPickerModalTab("Metrics").click();
        cy.findByText(ORDERS_SCALAR_METRIC.name).click();
      });
      addBreakout({ columnName: "Product ID" });
      startNewJoin({ isPostAggregation: true });
      entityPickerModal().within(() => {
        entityPickerModalTab("Tables").click();
        cy.findByText("Products").click();
      });
      getNotebookStep("join", { stage: 1 }).within(() => {
        cy.findByText("ID").should("be.visible");
        cy.findByText("Product ID").should("be.visible");
      });
      visualize();
      assertQueryBuilderRowCount(200);
    });
  });

  describe("custom columns", () => {
    it("should be able to use custom columns in metric queries (metabase#42360)", () => {
      startNewMetric();
      entityPickerModal().within(() => {
        entityPickerModalTab("Tables").click();
        cy.findByText("Orders").click();
      });
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

    it.skip("should be able to use implicitly joinable columns in custom columns in metric queries (metabase#42360)", () => {
      startNewMetric();
      entityPickerModal().within(() => {
        entityPickerModalTab("Tables").click();
        cy.findByText("Orders").click();
      });
      startNewCustomColumn();
      enterCustomColumnDetails({
        formula: "[Product → Price] * 2",
        name: "Price2",
      });
      popover().button("Done").click();
      addAggregation({ operatorName: "Average of ...", columnName: "Price2" });
      saveMetric();
      runQuery();
      verifyScalarValue("111.38");
    });

    it("should be able to use a custom column in a metric-based query", () => {
      createQuestion(ORDERS_SCALAR_METRIC);
      startNewMetric();
      entityPickerModal().within(() => {
        entityPickerModalTab("Metrics").click();
        cy.findByText(ORDERS_SCALAR_METRIC.name).click();
      });
      startNewCustomColumn();
      enterCustomColumnDetails({
        formula: "[Total] / 2",
        name: "Total2",
      });
      popover().button("Done").click();
      addNumberBetweenFilter({
        columnName: "Total2",
        minValue: 60,
        maxValue: 100,
      });
      saveMetric();
      runQuery();
      verifyScalarValue("3,326");
    });

    it("should open the expression editor automatically when the source metric is already used in an aggregation expression", () => {
      createQuestion(ORDERS_SCALAR_METRIC);
      startNewMetric();
      entityPickerModal().within(() => {
        entityPickerModalTab("Metrics").click();
        cy.findByText(ORDERS_SCALAR_METRIC.name).click();
      });
      startNewAggregation();
      cy.findByTestId("expression-editor").should("be.visible");
    });
  });

  describe("filters", () => {
    it("should add a filter to a metric based on a metric with a filter", () => {
      createQuestion(ORDERS_SCALAR_FILTER_METRIC);
      startNewMetric();
      entityPickerModal().within(() => {
        entityPickerModalTab("Metrics").click();
        cy.findByText(ORDERS_SCALAR_FILTER_METRIC.name).click();
      });
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
      entityPickerModal().within(() => {
        entityPickerModalTab("Tables").click();
        cy.findByText("Orders").click();
      });
      addAggregation({ operatorName: "Sum of ...", columnName: "Total" });
      addBreakout({ columnName: "Created At" });
      saveMetric();
      runQuery();
      verifyLineAreaBarChart({ xAxis: "Created At", yAxis: "Sum of Total" });
    });

    it("should create a geo metric with multiple breakouts", () => {
      startNewMetric();
      entityPickerModal().within(() => {
        entityPickerModalTab("Tables").click();
        cy.findByText("People").click();
      });
      addAggregation({ operatorName: "Count of rows" });
      addBreakout({ columnName: "Latitude" });
      addBreakout({ columnName: "Longitude" });
      saveMetric();
      runQuery();
      verifyPinMap();
    });

    it("should add a breakout clause in a metric query with 2 stages", () => {
      startNewMetric();
      entityPickerModal().within(() => {
        entityPickerModalTab("Tables").click();
        cy.findByText("Orders").click();
      });
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
      verifyLineAreaBarChart({
        xAxis: "Created At",
        yAxis: "Average of Count",
      });
    });
  });

  describe("aggregations", () => {
    it("should not be possible to save a metric without an aggregation clause", () => {
      startNewMetric();
      entityPickerModal().within(() => {
        entityPickerModalTab("Tables").click();
        cy.findByText("Orders").click();
      });
      cy.button("Save").should("be.disabled");
      cy.findByTestId("run-button").should("not.be.visible");
    });

    it("should create a metric with a custom aggregation expression based on 1 metric", () => {
      createQuestion(ORDERS_SCALAR_METRIC);
      startNewMetric();
      entityPickerModal().within(() => {
        entityPickerModalTab("Metrics").click();
        cy.findByText(ORDERS_SCALAR_METRIC.name).click();
      });
      getNotebookStep("summarize")
        .findByText(ORDERS_SCALAR_METRIC.name)
        .click();
      enterCustomColumnDetails({
        formula: `[${ORDERS_SCALAR_METRIC.name}] / 2`,
        name: "",
      });
      popover().button("Update").click();
      saveMetric();
      runQuery();
      verifyScalarValue("9,380");
    });

    it("should add an aggregation clause in a metric query with 2 stages", () => {
      startNewMetric();
      entityPickerModal().within(() => {
        entityPickerModalTab("Tables").click();
        cy.findByText("Orders").click();
      });
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
      entityPickerModal().within(() => {
        entityPickerModalTab("Tables").click();
        cy.findByText("Orders").click();
      });
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

  describe("compatible metrics", () => {
    it("should allow adding an aggregation based on a compatible metric for the same table in questions (metabase#42470)", () => {
      createQuestion(ORDERS_SCALAR_METRIC);
      createQuestion(ORDERS_SCALAR_FILTER_METRIC);
      createQuestion(PRODUCTS_SCALAR_METRIC);
      startNewQuestion();
      entityPickerModal().within(() => {
        entityPickerModalTab("Tables").click();
        cy.findByText("Orders").click();
      });
      startNewAggregation();
      popover().within(() => {
        cy.findByText("Common Metrics").click();
        cy.findByText(ORDERS_SCALAR_METRIC.name).should("be.visible");
        cy.findByText(ORDERS_SCALAR_FILTER_METRIC.name).should("be.visible");
        cy.findByText(PRODUCTS_SCALAR_METRIC.name).should("not.exist");
        cy.findByText(ORDERS_SCALAR_MODEL_METRIC.name).should("not.exist");
        cy.findByText(ORDERS_SCALAR_METRIC.name).click();
      });
      visualize();
      verifyScalarValue("18,760");
    });
  });
});

function getActionButton(title) {
  return cy.findByTestId("action-buttons").button(title);
}

function getPlusButton() {
  return cy.findAllByTestId("notebook-cell-item").last();
}

function startNewJoin({ stageIndex, isPostAggregation } = {}) {
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

function startNewCustomColumn({ stageIndex, isPostAggregation } = {}) {
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

function startNewFilter({ stageIndex, isPostAggregation } = {}) {
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

function startNewAggregation({ stageIndex, isPostAggregation } = {}) {
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

function startNewBreakout({ stageIndex } = {}) {
  getNotebookStep("summarize", { stage: stageIndex })
    .findByTestId("breakout-step")
    .within(() => getPlusButton().click());
}

function addStringCategoryFilter({ tableName, columnName, values }) {
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

function addNumberBetweenFilter({ tableName, columnName, minValue, maxValue }) {
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

function addDateBetweenFilter({ tableName, columnName, minValue, maxValue }) {
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
}) {
  startNewAggregation({ stageIndex, isPostAggregation });

  popover().within(() => {
    cy.findByText(operatorName).click();
    if (columnName) {
      cy.findByText(columnName).click();
    }
  });
}

function addBreakout({ tableName, columnName, bucketName, stageIndex }) {
  startNewBreakout({ stageIndex });
  if (tableName) {
    popover().findByText(tableName).click();
  }
  if (bucketName) {
    popover().findByLabelText(columnName).findByText("by month").click();
    popover().last().findByText(bucketName).click();
  } else {
    popover().findByText(columnName).click();
  }
}

function saveMetric({ name } = {}) {
  cy.intercept("POST", "/api/card").as("createCard");
  cy.button("Save").click();
  modal().within(() => {
    cy.findByText("Save metric").should("be.visible");
    if (name) {
      cy.findByLabelText("Name").clear().type(name);
    }
    cy.button("Save").click();
  });
  cy.wait("@createCard");
}

function updateMetric() {
  cy.intercept("PUT", "/api/card/*").as("updateCard");
  cy.button("Save changes").click();
  cy.wait("@updateCard");
}

function renameMetric(newName) {
  cy.intercept("PUT", "/api/card/*").as("updateCard");
  cy.findByTestId("saved-question-header-title").clear().type(newName).blur();
  cy.wait("@updateCard");
}

function runQuery() {
  cy.intercept("POST", "/api/dataset").as("dataset");
  cy.findAllByTestId("run-button").last().click();
  cy.wait("@dataset");
}

function verifyScalarValue(value) {
  cy.findByTestId("scalar-container").findByText(value).should("be.visible");
}

function verifyLineAreaBarChart({ xAxis, yAxis }) {
  echartsContainer().within(() => {
    cy.findByText(yAxis).should("be.visible");
    cy.findByText(xAxis).should("be.visible");
  });
}

function verifyPinMap() {
  cy.get("[data-element-id=pin-map]").should("exist");
}
