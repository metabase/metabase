const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const ORDERS_SCALAR_METRIC = {
  name: "Count of orders",
  type: "metric",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
  display: "scalar",
};

const ORDERS_TIMESERIES_METRIC = {
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

const MONTH_BREAKOUT = [
  "field",
  ORDERS.CREATED_AT,
  { "base-type": "type/DateTime", "temporal-unit": "month" },
];

function createQuestionWithMetric(
  metricId,
  { display = "line", breakout } = {},
) {
  const query = {
    "source-table": ORDERS_ID,
    aggregation: [["metric", metricId]],
  };
  if (breakout) {
    query.breakout = [breakout];
  }
  return H.createQuestion(
    { name: "Question with metric", type: "question", display, query },
    { visitQuestion: true },
  );
}

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

  it("should be able to add a filter to a question that uses a metric", () => {
    H.createQuestion(ORDERS_SCALAR_METRIC).then(({ body: metric }) => {
      createQuestionWithMetric(metric.id, { display: "scalar" });
    });
    H.openNotebook();
    H.filter({ mode: "notebook" });
    H.popover().within(() => {
      cy.findByText("Product").click();
      cy.findByText("Category").click();
      cy.findByText("Gadget").click();
      cy.button("Add filter").click();
    });
    H.visualize();
    cy.findByTestId("scalar-container")
      .findByText("4,939")
      .should("be.visible");
  });

  it("should be able to add a custom aggregation expression based on a metric", () => {
    H.createQuestion(ORDERS_TIMESERIES_METRIC).then(({ body: metric }) => {
      createQuestionWithMetric(metric.id, { breakout: MONTH_BREAKOUT });
    });
    H.openNotebook();
    H.getNotebookStep("summarize")
      .findByText(ORDERS_TIMESERIES_METRIC.name)
      .click();
    H.enterCustomColumnDetails({
      formula: `[${ORDERS_TIMESERIES_METRIC.name}] * 2`,
      name: "Expression",
      format: true,
    });
    H.popover().button("Update").should("not.be.disabled").click();
    H.visualize();
    H.echartsContainer().findByText("Expression").should("be.visible");
  });

  it("should be able to add a breakout to a question that uses a metric", () => {
    H.createQuestion(ORDERS_TIMESERIES_METRIC).then(({ body: metric }) => {
      createQuestionWithMetric(metric.id, { breakout: MONTH_BREAKOUT });
    });
    H.openNotebook();
    H.getNotebookStep("summarize")
      .findByTestId("breakout-step")
      .findByText("Created At: Month")
      .click();
    H.popover().within(() => {
      cy.findByText("Product").click();
      cy.findByText("Category").click();
    });
    H.visualize();
    H.echartsContainer().findByText("Product → Category").should("be.visible");
  });

  it("should be able to change the temporal unit when consuming a timeseries metric", () => {
    H.createQuestion(ORDERS_TIMESERIES_METRIC).then(({ body: metric }) => {
      createQuestionWithMetric(metric.id, { breakout: MONTH_BREAKOUT });
    });
    H.openNotebook();
    H.getNotebookStep("summarize")
      .findByTestId("breakout-step")
      .findByText("Created At: Month")
      .click();
    H.changeBinningForDimension({
      name: "Created At",
      fromBinning: "by month",
      toBinning: "Year",
    });
    H.visualize();
    H.assertQueryBuilderRowCount(5);
  });

  it("should be able to drill-thru with a metric", () => {
    H.createQuestion(ORDERS_TIMESERIES_METRIC).then(({ body: metric }) => {
      createQuestionWithMetric(metric.id, { breakout: MONTH_BREAKOUT });
    });
    H.cartesianChartCircle().eq(23).click({ force: true });
    H.popover().within(() => {
      cy.findByText("Break out by…").click();
      cy.findByText("Category").click();
      cy.findByText("Source").click();
    });
    cy.wait("@dataset");
    H.echartsContainer().findByText("User → Source").should("be.visible");
  });

  it("should be able to drill-thru with a metric without the aggregation clause", () => {
    H.createQuestion(ORDERS_TIMESERIES_METRIC).then(({ body: metric }) => {
      createQuestionWithMetric(metric.id, { breakout: MONTH_BREAKOUT });
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
    cy.findByTestId("metric-value-preview").should("be.visible");
    H.echartsContainer().should("be.visible");
    H.MetricPage.aboutPage().within(() => {
      cy.button(/Filter/).should("not.exist");
      cy.button(/Summarize/).should("not.exist");
    });
  });
});

describe("metrics", () => {
  beforeEach(() => {
    H.resetSnowplow();
    H.restore();
    cy.signInAsAdmin();
    H.enableTracking();
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("should bookmark a metric", () => {
    H.createQuestion({ ...ORDERS_SCALAR_METRIC, name: "Metric Foo" });
    H.createQuestion({ ...ORDERS_SCALAR_METRIC, name: "Metric Bar" });
    H.createQuestion(
      { ...ORDERS_SCALAR_METRIC, name: "Metric Baz" },
      { visitQuestion: true },
    );
    H.MetricPage.moreMenu().click();
    H.popover().findByTextEnsureVisible("Bookmark").click();
    H.navigationSidebar().findByText("Metric Baz").should("be.visible");

    H.navigationSidebar().findByText("Our analytics").click();
    cy.findAllByTestId("collection-entry")
      .filter(":contains(Metric Bar)")
      .icon("ellipsis")
      .click();
    H.popover().findByText("Bookmark").click();
    H.expectUnstructuredSnowplowEvent({
      event: "bookmark_added",
      event_detail: "metric",
      triggered_from: "collection_list",
    });

    H.navigationSidebar().findByText("Metrics").click();
    cy.findAllByRole("row")
      .filter(":contains(Metric Foo)")
      .icon("ellipsis")
      .click();
    H.popover().findByText("Bookmark").click();
    H.expectUnstructuredSnowplowEvent({
      event: "bookmark_added",
      event_detail: "metric",
      triggered_from: "browse_metrics",
    });
  });
});
