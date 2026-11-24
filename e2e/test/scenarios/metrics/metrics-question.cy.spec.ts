const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { StructuredQuestionDetails } from "e2e/support/helpers";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const ORDERS_SCALAR_METRIC: StructuredQuestionDetails = {
  name: "Count of orders",
  type: "metric",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
  display: "scalar",
};

const ORDERS_TIMESERIES_METRIC: StructuredQuestionDetails = {
  name: "Count of orders over time",
  type: "metric",
  query: {
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
  display: "line",
};

describe("scenarios > metrics > question", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should be able to move a metric to a different collection", () => {
    H.createQuestion(ORDERS_SCALAR_METRIC, { visitQuestion: true });
    H.MetricPage.moreMenu().click();
    H.popover().findByText("Move").click();
    H.modal().within(() => {
      cy.findByText("First collection").click();
      cy.button("Move").click();
    });
    H.undoToast().within(() => {
      cy.findByText(/Metric moved to/).should("be.visible");
      cy.findByText("First collection").should("be.visible");
    });
    H.MetricPage.header().findByText("First collection").should("be.visible");
  });

  it("should be able to view the underlying records of a point of a chart that uses a metric", () => {
    H.createQuestion(ORDERS_TIMESERIES_METRIC).then(({ body: metric }) => {
      H.createQuestion(
        {
          name: "Question with metric",
          type: "question",
          display: "line",
          query: {
            "source-table": ORDERS_ID,
            aggregation: [["metric", metric.id]],
            breakout: [
              [
                "field",
                ORDERS.CREATED_AT,
                { "base-type": "type/DateTime", "temporal-unit": "month" },
              ],
            ],
          },
        },
        { visitQuestion: true },
      );
    });

    H.cartesianChartCircle().eq(23).click({ force: true });
    H.popover().findByText("See these Orders").click();
    cy.wait("@dataset");
    cy.findByTestId("qb-filters-panel")
      .findByText("Created At: Month is Mar 1–31, 2027")
      .should("be.visible");
    H.assertQueryBuilderRowCount(445);
  });

  it("should be able to view a table-based metric without data access", () => {
    cy.intercept("POST", "/api/metric/dataset").as("metricDataset");
    H.createQuestion(ORDERS_SCALAR_METRIC).then(({ body: card }) => {
      cy.signInAsSandboxedUser();
      H.visitMetric(card.id);
    });
    cy.wait("@metricDataset").its("response.statusCode").should("equal", 202);
    cy.findByTestId("visualization-root")
      .should("be.visible")
      .and("have.attr", "data-viz-ui-name", "Number");
    cy.findByTestId("scalar-value").should("be.visible");
  });
});

describe("issue 44171", () => {
  const METRIC_A: StructuredQuestionDetails = {
    name: "Metric 44171-A",
    type: "metric",
    display: "line",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [
        [
          "field",
          ORDERS.CREATED_AT,
          { "temporal-unit": "month", "base-type": "type/DateTime" },
        ],
      ],
    },
  };

  const METRIC_B: StructuredQuestionDetails = {
    name: "Metric 44171-B",
    type: "metric",
    display: "line",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [
        [
          "field",
          ORDERS.CREATED_AT,
          { "temporal-unit": "month", "base-type": "type/DateTime" },
        ],
      ],
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    H.createQuestion(METRIC_A);
    H.createQuestion(METRIC_B, { wrapId: true, idAlias: "metricBId" });
    H.createDashboard(
      {
        name: "Dashboard 44171",
        dashcards: [],
      },
      { wrapId: true },
    );
  });

  it("should not save viz settings on metrics", () => {
    cy.intercept("PUT", "/api/card/*").as("saveCard");
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");

    cy.get<number>("@metricBId").then((metricBId) => {
      cy.visit(`/metric/${metricBId}/query`);
    });
    H.MetricPage.queryEditor().should("be.visible");

    H.getNotebookStep("summarize").findByText("Count").click();
    H.popover().within(() => {
      cy.findByText("Sum of ...").click();
      cy.findByText("Total").click();
    });
    H.runButtonInOverlay().click();
    cy.wait("@dataset");
    H.MetricPage.saveButton().click();
    cy.wait("@saveCard");

    cy.get<number>("@dashboardId").then((id) => {
      H.visitDashboard(id);
    });

    H.editDashboard();
    cy.findByTestId("dashboard-header")
      .findByLabelText("Add questions")
      .click();

    H.sidebar().findByText("Metric 44171-A").click();

    H.showDashboardCardActions(0);
    H.getDashboardCard(0)
      .realHover({ scrollBehavior: "bottom" })
      .findByLabelText("Visualize another way")
      .click();
    H.modal().within(() => {
      H.switchToAddMoreData();
      H.selectDataset("Metric 44171-B");
      H.chartLegendItem("Metric 44171-A").should("exist");
      H.chartLegendItem("Metric 44171-B").should("exist");
    });
  });
});

describe("issue 79571", () => {
  const METRIC_NAME = "Metric 79571";

  const ORDERS_COUNT_METRIC: StructuredQuestionDetails = {
    name: METRIC_NAME,
    type: "metric",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
    },
  };

  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("logs choosing a metric as a recent selection and lists it under Recent items (metabase#79571)", () => {
    H.createQuestion(ORDERS_COUNT_METRIC);
    cy.intercept("POST", "/api/activity/recents").as("logRecent");

    H.startNewQuestion();
    H.miniPicker().within(() => {
      cy.findByText("Our analytics").click();
      cy.findByText(METRIC_NAME).click();
    });

    cy.wait("@logRecent").its("response.statusCode").should("eq", 204);

    // Reopening the picker now surfaces the metric under Recent items
    H.getNotebookStep("data").findByText("Orders").click();
    H.miniPickerHeader().click();
    H.miniPickerBrowseAll().click();
    H.entityPickerModalItem(0, "Recent items").click();
    cy.findByRole("dialog", { name: "Pick your starting data" })
      .findByText(METRIC_NAME)
      .should("exist");
  });
});
