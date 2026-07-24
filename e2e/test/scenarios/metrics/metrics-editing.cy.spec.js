const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_MODEL_ID } from "e2e/support/cypress_sample_instance_data";

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

function startNewMetricWithTable(database, table) {
  H.startNewMetric();
  H.MetricPage.queryEditor().should("be.visible");
  H.miniPicker().within(() => {
    cy.findByText(database).click();
    cy.findByText(table).click();
  });
}

function startNewMetricWithSavedItem(collection, name) {
  H.startNewMetric();
  H.MetricPage.queryEditor().should("be.visible");
  H.miniPicker().within(() => {
    cy.findByText(collection).click();
    cy.findByText(name).click();
  });
}

function saveNewMetric({ name } = {}) {
  cy.intercept("POST", "/api/card").as("createCard");
  H.MetricPage.saveButton().click();
  H.modal().within(() => {
    cy.findByText("Save your metric").should("be.visible");
    if (name) {
      cy.findByLabelText("Name").clear().type(name);
    }
    cy.button("Save").click();
  });
  cy.wait("@createCard");
}

function getActionButton(title) {
  return cy.findByTestId("action-buttons").button(title);
}

function getPlusButton() {
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
  return cy.findAllByTestId("notebook-cell-item").last();
}

function startNewJoin({ stageIndex } = {}) {
  H.getNotebookStep("data", { stage: stageIndex }).within(() =>
    getActionButton("Join data").click(),
  );
}

function startNewCustomColumn({ stageIndex } = {}) {
  H.getNotebookStep("data", { stage: stageIndex }).within(() =>
    getActionButton("Custom column").click(),
  );
}

function startNewFilter({ stageIndex } = {}) {
  H.getNotebookStep("filter", { stage: stageIndex }).within(() =>
    getPlusButton().click(),
  );
}

function startNewAggregation({ stageIndex } = {}) {
  H.getNotebookStep("summarize", { stage: stageIndex })
    .findByTestId("aggregate-step")
    .within(() => getPlusButton().click());
}

function addStringCategoryFilter({ tableName, columnName, values }) {
  startNewFilter();
  H.popover().within(() => {
    if (tableName) {
      cy.findByText(tableName).click();
    }
    cy.findByText(columnName).click();
    values.forEach((value) => cy.findByText(value).click());
    cy.button("Add filter").click();
  });
}

function verifyScalarValue(value) {
  cy.findByTestId("scalar-value").should("have.text", value).and("be.visible");
}

function verifyLineChart({ yAxis }) {
  H.echartsContainer().within(() => {
    cy.findByText(yAxis).should("be.visible");
  });
  cy.findByTestId("visualization-root").should(
    "have.attr",
    "data-viz-ui-name",
    "Line",
  );
}

function verifyMetricAboutTimeseries({ yAxis }) {
  H.MetricPage.aboutPage().within(() => {
    cy.findByRole("button", { name: "Select dimension: Created At" })
      .should("be.visible")
      .and("contain.text", "Created At");
    cy.findByTestId("metric-value-preview").should("be.visible");
    cy.findByTestId("visualization-root")
      .should("be.visible")
      .and("have.attr", "data-viz-ui-name", "Line");
    H.echartsContainer().findByText(yAxis).should("be.visible");
  });
}

function verifyMetricDefinitionChart({ yAxis }) {
  H.MetricPage.definitionTab().click();
  H.MetricPage.queryEditor().should("be.visible");
  H.getNotebookStep("summarize").findByText(yAxis).should("be.visible");
  cy.intercept("POST", "/api/dataset").as("dataset");
  H.runButtonInOverlay().click();
  cy.wait("@dataset");
  verifyLineChart({ yAxis });
}

describe("scenarios > metrics > editing", () => {
  beforeEach(() => {
    H.restore();
    H.resetSnowplow();
    cy.signInAsNormalUser();
  });

  describe("organization", () => {
    it("should be able to rename a metric", () => {
      cy.intercept("PUT", "/api/card/*").as("updateCard");
      H.createQuestion(ORDERS_SCALAR_METRIC).then(({ body: card }) => {
        H.visitMetric(card.id);
      });
      H.MetricPage.aboutPage()
        .findByDisplayValue(ORDERS_SCALAR_METRIC.name)
        .clear()
        .type("New metric name{enter}");
      cy.wait("@updateCard");
      H.MetricPage.aboutPage()
        .findByDisplayValue("New metric name")
        .should("be.visible");
    });

    it("should be able to change the query definition of a metric", () => {
      cy.intercept("PUT", "/api/card/*").as("updateCard");
      H.createQuestion(ORDERS_SCALAR_METRIC).then(({ body: card }) =>
        cy.visit(`/metric/${card.id}/query`),
      );
      H.MetricPage.queryEditor().should("be.visible");
      H.getNotebookStep("summarize").button("Count").click();
      H.popover().within(() => {
        cy.findByText("Sum of ...").click();
        cy.findByText("Total").click();
      });
      H.MetricPage.saveButton().click();
      H.MetricPage.saveButton().should("not.exist");
      H.MetricPage.aboutTab().click();
      verifyMetricAboutTimeseries({ yAxis: "Sum of Total" });
    });

    it("should pin new metrics automatically", () => {
      cy.visit("/browse/metrics");
      cy.findByTestId("browse-metrics-header")
        .findByLabelText("Create a new metric")
        .should("be.visible")
        .click();

      H.expectUnstructuredSnowplowEvent({
        event: "metric_create_started",
        triggered_from: "browse_metrics",
      });

      H.MetricPage.queryEditor().should("be.visible");
      H.miniPicker().within(() => {
        cy.findByText("Sample Database").click();
        cy.findByText("Orders").click();
      });
      saveNewMetric({ name: "Pinned metric" });

      H.expectUnstructuredSnowplowEvent({
        event: "metric_created",
        triggered_from: "main_app",
        result: "success",
      });

      H.MetricPage.aboutPage().should("be.visible");
      H.MetricPage.header().findByText("Our analytics").click();

      cy.findByTestId("pinned-items").within(() => {
        cy.findByRole("heading", { name: "Metrics" }).should("be.visible");
        cy.findByText("Pinned metric")
          .closest("a")
          .within(() => {
            cy.findByTestId("visualization-root")
              .should("be.visible")
              .and("have.attr", "data-viz-ui-name", "Line");
            H.echartsContainer().should("be.visible");
          });
      });
    });

    it("should not crash when cancelling creation or editing of a metric (metabase#48024)", () => {
      cy.log("cancel new metric creation");
      startNewMetricWithTable("Sample Database", "Orders");
      H.MetricPage.cancelButton().click();

      cy.log("cancel editing an existing metric");
      H.createQuestion(ORDERS_SCALAR_METRIC).then(({ body: card }) =>
        cy.visit(`/metric/${card.id}/query`),
      );
      H.MetricPage.queryEditor().should("be.visible");
      H.getNotebookStep("summarize").button("Count").click();
      H.popover().within(() => {
        cy.findByText("Sum of ...").click();
        cy.findByText("Total").click();
      });
      H.MetricPage.cancelButton().click();
      H.getNotebookStep("summarize").findByText("Count").should("be.visible");
    });
  });

  describe("data source", () => {
    it("should create a metric based on a table", () => {
      startNewMetricWithTable("Sample Database", "Orders");
      addStringCategoryFilter({
        tableName: "Product",
        columnName: "Category",
        values: ["Gadget"],
      });
      saveNewMetric();
      verifyMetricAboutTimeseries({ yAxis: "Count" });
    });

    it("should not allow to create a multi-stage metric", () => {
      startNewMetricWithSavedItem("Our analytics", "Orders Model");
      H.MetricPage.queryEditor()
        .findByRole("button", { name: "Summarize" })
        .should("not.exist");
    });

    it("should allow to run the query from the metric empty state", () => {
      startNewMetricWithTable("Sample Database", "Orders");
      cy.intercept("POST", "/api/dataset").as("dataset");
      H.runButtonInOverlay().click();
      cy.wait("@dataset");
      verifyLineChart({ yAxis: "Count" });
    });
  });

  describe("joins", () => {
    it("should join a table", () => {
      startNewMetricWithTable("Sample Database", "Products");
      startNewJoin();
      H.miniPicker().within(() => {
        cy.findByText("Sample Database").click();
        cy.findByText("Orders").click();
      });
      startNewFilter();
      H.popover().within(() => {
        cy.findByText("User").click();
        cy.findByText("State").click();
        cy.findByText("CA").click();
        cy.button("Add filter").click();
      });
      saveNewMetric();
      verifyMetricAboutTimeseries({ yAxis: "Count" });
    });

    it("should not be possible to join a metric", () => {
      H.createQuestion(ORDERS_SCALAR_METRIC);
      startNewMetricWithTable("Sample Database", "Orders");
      startNewJoin();
      H.miniPicker().within(() => {
        cy.findByText("Our analytics").click();
        cy.findByText("Orders").should("be.visible");
        cy.findByText(ORDERS_SCALAR_METRIC.name).should("not.exist");
        cy.findByText("Our analytics").click();
      });
      H.miniPickerBrowseAll().click();
      H.entityPickerModal().within(() => {
        cy.findByText("Sample Database").click();
        cy.findByText("Orders").should("be.visible");
        cy.findByText(ORDERS_SCALAR_METRIC.name).should("not.exist");
      });
    });

    it("should be possible to join data on the first stage of a metric-based query", () => {
      H.createQuestion(ORDERS_SCALAR_METRIC);
      H.startNewQuestion();
      H.miniPicker().within(() => {
        cy.findByText("Our analytics").click();
        cy.findByText(ORDERS_SCALAR_METRIC.name).click();
      });
      H.getNotebookStep("data").within(() => {
        getActionButton("Custom column").should("be.visible");
        getActionButton("Join data").should("be.visible");
      });
    });
  });

  describe("custom columns", () => {
    it("should be able to use custom columns and implicitly joinable columns in metric queries (metabase#42360)", () => {
      cy.log("custom column from same table");
      startNewMetricWithTable("Sample Database", "Orders");
      startNewCustomColumn();
      H.enterCustomColumnDetails({
        formula: "[Total] / 2",
        name: "Total2",
      });
      H.popover().button("Done").click();
      H.getNotebookStep("summarize").findByText("Count").click();
      H.popover().within(() => {
        cy.findByText("Sum of ...").click();
        cy.findByText("Total2").click();
      });
      saveNewMetric();
      verifyMetricDefinitionChart({ yAxis: "Sum of Total2" });

      cy.log("custom column from implicitly joined table");
      startNewMetricWithTable("Sample Database", "Orders");
      startNewCustomColumn();
      H.enterCustomColumnDetails({
        formula: "[Product → Price] * 2",
        name: "Price2",
      });
      H.popover().button("Done").click();
      H.getNotebookStep("summarize").findByText("Count").click();
      H.popover().within(() => {
        cy.findByText("Average of ...").click();
        cy.findByText("Price2").click();
      });
      saveNewMetric();
      verifyMetricDefinitionChart({ yAxis: "Average of Price2" });
    });
  });

  describe("breakouts", () => {
    it("should create a timeseries metric", () => {
      startNewMetricWithTable("Sample Database", "Orders");
      H.getNotebookStep("summarize").findByText("Count").click();
      H.popover().within(() => {
        cy.findByText("Sum of ...").click();
        cy.findByText("Total").click();
      });
      saveNewMetric();
      verifyMetricAboutTimeseries({ yAxis: "Sum of Total" });
    });
  });

  describe("aggregations", () => {
    it("should create a metric with a custom aggregation expression based on 1 metric", () => {
      H.createQuestion(ORDERS_SCALAR_METRIC);
      H.startNewMetric();
      H.MetricPage.queryEditor().should("be.visible");
      cy.intercept("POST", "/api/dataset/query_metadata").as("metadata");
      H.miniPickerBrowseAll().click();
      H.entityPickerModal().within(() => {
        cy.findByText("Our analytics").click();
        cy.findByText(ORDERS_SCALAR_METRIC.name).click();
      });
      cy.wait("@metadata");
      H.getNotebookStep("summarize")
        .findByText(ORDERS_SCALAR_METRIC.name)
        .click();
      H.enterCustomColumnDetails({
        formula: `[${ORDERS_SCALAR_METRIC.name}] / 2`,
        name: "",
        blur: true,
      });
      H.popover().button("Update").should("not.be.disabled").click();
      saveNewMetric();
      verifyMetricAboutTimeseries({ yAxis: "Orders metric" });
    });

    it("should have metric-specific summarize step copy", () => {
      H.createQuestion(ORDERS_SCALAR_METRIC).then(({ body: card }) =>
        cy.visit(`/metric/${card.id}/query`),
      );
      H.MetricPage.queryEditor().should("be.visible");

      H.getNotebookStep("summarize").within(() => {
        cy.findByText("Formula").should("be.visible");
        cy.findByText("Default time dimension").should("not.exist");
      });

      cy.viewport(800, 600);
      H.getNotebookStep("summarize").within(() => {
        // We need the scroll because of the viewport change, the next findByText is technically off the screen without it
        cy.findByText("Formula").should("be.visible").scrollIntoView({});
        cy.findByText("Default time dimension").should("not.exist");
      });
    });
  });

  describe("compatible metrics", () => {
    it("should allow adding an aggregation based on a compatible metric for the same table in questions (metabase#42470)", () => {
      H.createQuestion(ORDERS_SCALAR_METRIC);
      H.createQuestion(ORDERS_SCALAR_FILTER_METRIC);
      H.createQuestion(PRODUCTS_SCALAR_METRIC);
      H.startNewQuestion();
      H.miniPicker().within(() => {
        cy.findByText("Sample Database").click();
        cy.findByText("Orders").click();
      });
      startNewAggregation();
      H.popover().within(() => {
        cy.findByText("Metrics").click();
        cy.findByText(ORDERS_SCALAR_METRIC.name).should("be.visible");
        cy.findByText(ORDERS_SCALAR_FILTER_METRIC.name).should("be.visible");
        cy.findByText(PRODUCTS_SCALAR_METRIC.name).should("not.exist");
        cy.findByText(ORDERS_SCALAR_MODEL_METRIC.name).should("not.exist");
        cy.findByText(ORDERS_SCALAR_METRIC.name).click();
      });
      H.visualize();
      verifyScalarValue("18,760");
    });

    it("should for searching for metrics", () => {
      H.createQuestion(ORDERS_SCALAR_METRIC);
      H.createQuestion(ORDERS_SCALAR_FILTER_METRIC);
      H.createQuestion(PRODUCTS_SCALAR_METRIC);
      H.startNewQuestion();
      H.miniPicker().within(() => {
        cy.findByText("Sample Database").click();
        cy.findByText("Orders").click();
      });
      startNewAggregation();
      H.popover().within(() => {
        cy.findByPlaceholderText("Find...").type("with filter");
        cy.findByText("Metrics").should("be.visible");
        cy.findByText(ORDERS_SCALAR_METRIC.name).should("not.exist");
        cy.findByText(PRODUCTS_SCALAR_METRIC.name).should("not.exist");
        cy.findByText(ORDERS_SCALAR_MODEL_METRIC.name).should("not.exist");
        cy.findByText(ORDERS_SCALAR_FILTER_METRIC.name).should("be.visible");
      });
    });

    it("should show the description for metrics", () => {
      H.createQuestion(ORDERS_SCALAR_FILTER_METRIC);
      H.startNewQuestion();
      H.miniPicker().within(() => {
        cy.findByText("Sample Database").click();
        cy.findByText("Orders").click();
      });
      startNewAggregation();
      H.popover().within(() => {
        cy.findByText("Metrics").click();
        cy.findByText(ORDERS_SCALAR_FILTER_METRIC.name).should("be.visible");
        cy.findByText(ORDERS_SCALAR_FILTER_METRIC.name).realHover();
        cy.findByLabelText("More info").should("exist").realHover();
      });

      H.hovercard().within(() => {
        cy.contains("This is a description").should("be.visible");
        cy.contains("with markdown").should("be.visible");
      });
    });
  });
});
