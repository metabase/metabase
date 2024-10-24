import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_MODEL_ID } from "e2e/support/cypress_sample_instance_data";
import {
  appBar,
  commandPalette,
  createQuestion,
  echartsContainer,
  enterCustomColumnDetails,
  entityPickerModal,
  entityPickerModalTab,
  getNotebookStep,
  hovercard,
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
  description: "This is a description _with markdown_",
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
      saveMetric({ name: "my new metric" });
      verifyScalarValue("18,760");

      cy.log(
        "newly created metric should be visible in recents (metabase#44223)",
      );
      appBar()
        .findByText(/search/i)
        .click();
      commandPalette().findByText("my new metric").should("be.visible");
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
      addBreakout({ tableName: "Product", columnName: "Created At" });
      updateMetric();
      verifyLineAreaBarChart({
        xAxis: "Product → Created At: Month",
        yAxis: "Count",
      });
    });

    it("should be able to change the query definition of a metric based on a model", () => {
      createQuestion(ORDERS_SCALAR_MODEL_METRIC).then(({ body: card }) =>
        visitMetric(card.id),
      );
      openQuestionActions();
      popover().findByText("Edit metric definition").click();
      addBreakout({ tableName: "Product", columnName: "Created At" });
      updateMetric();
      verifyLineAreaBarChart({
        xAxis: "Product → Created At: Month",
        yAxis: "Count",
      });
    });

    it("should pin new metrics automatically", () => {
      cy.visit("/");
      cy.findByTestId("app-bar").findByText("New").click();
      popover().findByText("Metric").click();
      entityPickerModal().within(() => {
        entityPickerModalTab("Tables").click();
        cy.findByText("Orders").click();
      });
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

    it("should not crash when cancelling creation of a new metric (metabase#48024)", () => {
      startNewMetric();
      entityPickerModal().within(() => {
        entityPickerModalTab("Tables").click();
        cy.findByText("Orders").click();
      });
      cancelMetricEditing();
    });

    it("should not crash when cancelling editing of an existing metric (metabase#48024)", () => {
      createQuestion(ORDERS_SCALAR_METRIC).then(({ body: card }) =>
        visitMetric(card.id),
      );
      openQuestionActions();
      popover().findByText("Edit metric definition").click();
      addBreakout({ tableName: "Product", columnName: "Created At" });
      cancelMetricEditing();
      verifyScalarValue("18,760");
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
      saveMetric();
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
      saveMetric();
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
      saveMetric();
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
      saveMetric();
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
      saveMetric();
      verifyScalarValue("5");
    });

    it("should not allow to create a multi-stage metric", () => {
      startNewMetric();
      entityPickerModal().within(() => {
        entityPickerModalTab("Models").click();
        cy.findByText("Orders Model").click();
      });
      getActionButton("Summarize").should("not.exist");
    });

    it("should allow to run the query from the metric empty state", () => {
      startNewMetric();
      entityPickerModal().within(() => {
        entityPickerModalTab("Tables").click();
        cy.findByText("Orders").click();
      });
      cy.intercept("POST", "/api/dataset").as("dataset");
      cy.findByTestId("metric-empty-state").button("Visualize").click();
      cy.wait("@dataset");
      verifyScalarValue("18,760");
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
      saveMetric();
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

    it("should be possible to join data on the first stage of a metric-based query", () => {
      createQuestion(ORDERS_SCALAR_METRIC);
      startNewQuestion();
      entityPickerModal().within(() => {
        entityPickerModalTab("Metrics").click();
        cy.findByText(ORDERS_SCALAR_METRIC.name).click();
      });
      getNotebookStep("data").within(() => {
        getActionButton("Custom column").should("be.visible");
        getActionButton("Join data").should("be.visible");
      });
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
      getNotebookStep("summarize").findByText("Count").click();
      popover().within(() => {
        cy.findByText("Sum of ...").click();
        cy.findByText("Total2").click();
      });
      saveMetric();
      verifyScalarValue("755,310.84");
    });

    it("should be able to use implicitly joinable columns in custom columns in metric queries (metabase#42360)", () => {
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
      getNotebookStep("summarize").findByText("Count").click();
      popover().within(() => {
        cy.findByText("Average of ...").click();
        cy.findByText("Price2").click();
      });
      saveMetric();
      verifyScalarValue("111.38");
    });
  });

  describe("breakouts", () => {
    it("should create a timeseries metric", () => {
      startNewMetric();
      entityPickerModal().within(() => {
        entityPickerModalTab("Tables").click();
        cy.findByText("Orders").click();
      });
      getNotebookStep("summarize").findByText("Count").click();
      popover().within(() => {
        cy.findByText("Sum of ...").click();
        cy.findByText("Total").click();
      });
      addBreakout({ columnName: "Created At" });
      saveMetric();
      verifyLineAreaBarChart({
        xAxis: "Created At: Month",
        yAxis: "Sum of Total",
      });
    });
  });

  describe("aggregations", () => {
    it("should create a metric with a custom aggregation expression based on 1 metric", () => {
      createQuestion(ORDERS_SCALAR_METRIC);
      startNewMetric();
      cy.intercept("POST", "/api/dataset/query_metadata").as("queryMetadata");
      entityPickerModal().within(() => {
        entityPickerModalTab("Metrics").click();
        cy.findByText(ORDERS_SCALAR_METRIC.name).click();
      });
      cy.wait("@queryMetadata");
      getNotebookStep("summarize")
        .findByText(ORDERS_SCALAR_METRIC.name)
        .click();
      enterCustomColumnDetails({
        formula: `[${ORDERS_SCALAR_METRIC.name}] / 2`,
        name: "",
      });
      popover().button("Update").click();
      saveMetric();
      verifyScalarValue("9,380");
    });

    it("should have metric-specific summarize step copy", () => {
      createQuestion(ORDERS_SCALAR_METRIC).then(({ body: card }) =>
        visitMetric(card.id),
      );
      openQuestionActions();
      popover().findByText("Edit metric definition").click();

      cy.log("regular screen");
      getNotebookStep("summarize").within(() => {
        cy.findByText("Formula").should("be.visible");
        cy.findAllByText("Default time dimension")
          .filter(":visible")
          .should("have.length", 1);
      });

      cy.log("mobile screen");
      cy.viewport(800, 600);
      getNotebookStep("summarize").within(() => {
        cy.findByText("Formula").should("be.visible");
        cy.findAllByText("Default time dimension")
          .filter(":visible")
          .should("have.length", 1);
      });
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
        cy.findByText("Metrics").click();
        cy.findByText(ORDERS_SCALAR_METRIC.name).should("be.visible");
        cy.findByText(ORDERS_SCALAR_FILTER_METRIC.name).should("be.visible");
        cy.findByText(PRODUCTS_SCALAR_METRIC.name).should("not.exist");
        cy.findByText(ORDERS_SCALAR_MODEL_METRIC.name).should("not.exist");
        cy.findByText(ORDERS_SCALAR_METRIC.name).click();
      });
      visualize();
      verifyScalarValue("18,760");
    });

    it("should for searching for metrics", () => {
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
        cy.findByPlaceholderText("Find...").type("with filter");
        cy.findByText("Metrics").should("be.visible");
        cy.findByText(ORDERS_SCALAR_METRIC.name).should("not.exist");
        cy.findByText(PRODUCTS_SCALAR_METRIC.name).should("not.exist");
        cy.findByText(ORDERS_SCALAR_MODEL_METRIC.name).should("not.exist");
        cy.findByText(ORDERS_SCALAR_FILTER_METRIC.name).should("be.visible");
      });
    });

    it("should show the description for metrics", () => {
      createQuestion(ORDERS_SCALAR_FILTER_METRIC);
      startNewQuestion();
      entityPickerModal().within(() => {
        entityPickerModalTab("Tables").click();
        cy.findByText("Orders").click();
      });
      startNewAggregation();
      popover().within(() => {
        cy.findByText("Metrics").click();
        cy.findByText(ORDERS_SCALAR_FILTER_METRIC.name).should("be.visible");
        cy.findByText(ORDERS_SCALAR_FILTER_METRIC.name).realHover();

        cy.findByLabelText("More info").should("exist").realHover();
      });

      hovercard().within(() => {
        cy.contains("This is a description").should("be.visible");
        cy.contains("with markdown").should("be.visible");
      });
    });
  });
});

function getActionButton(title) {
  return cy.findByTestId("action-buttons").button(title);
}

function getPlusButton() {
  return cy.findAllByTestId("notebook-cell-item").last();
}

function startNewJoin({ stageIndex } = {}) {
  getNotebookStep("data", { stage: stageIndex }).within(() =>
    getActionButton("Join data").click(),
  );
}

function startNewCustomColumn({ stageIndex } = {}) {
  getNotebookStep("data", { stage: stageIndex }).within(() =>
    getActionButton("Custom column").click(),
  );
}

function startNewFilter({ stageIndex } = {}) {
  getNotebookStep("filter", { stage: stageIndex }).within(() =>
    getPlusButton().click(),
  );
}

function startNewAggregation({ stageIndex } = {}) {
  getNotebookStep("summarize", { stage: stageIndex })
    .findByTestId("aggregate-step")
    .within(() => getPlusButton().click());
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

function addAggregation({ operatorName, columnName, stageIndex }) {
  startNewAggregation({ stageIndex });

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

function verifyScalarValue(value) {
  cy.findByTestId("scalar-container").findByText(value).should("be.visible");
}

function verifyLineAreaBarChart({ xAxis, yAxis }) {
  echartsContainer().within(() => {
    cy.findByText(yAxis).should("be.visible");
    cy.findByText(xAxis).should("be.visible");
  });
}

function cancelMetricEditing() {
  cy.log("click cancel but do not confirm");
  cy.button("Cancel").click();
  modal().button("Cancel").click();
  modal().should("not.exist");
  appBar().should("not.exist");

  cy.log("click cancel and confirm");
  cy.button("Cancel").click();
  modal().button("Discard changes").click();
  appBar().should("be.visible");
}
