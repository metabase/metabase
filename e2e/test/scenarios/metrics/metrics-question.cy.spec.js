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

  it("should be able to change the temporal unit and then replace the breakout when consuming a timeseries metric", () => {
    H.createQuestion(ORDERS_TIMESERIES_METRIC).then(({ body: metric }) => {
      createQuestionWithMetric(metric.id, { breakout: MONTH_BREAKOUT });
    });

    cy.log("change the temporal unit");
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

    cy.log("replace the breakout");
    H.openNotebook();
    H.getNotebookStep("summarize")
      .findByTestId("breakout-step")
      .findByText("Created At: Year")
      .click();
    H.popover().within(() => {
      cy.findByText("Product").click();
      cy.findByText("Category").click();
    });
    H.visualize();
    H.echartsContainer().findByText("Product → Category").should("be.visible");
  });

  it("should be able to drill-thru with a metric by breaking out the point and by viewing its underlying records", () => {
    H.createQuestion(ORDERS_TIMESERIES_METRIC).then(({ body: metric }) => {
      createQuestionWithMetric(metric.id, { breakout: MONTH_BREAKOUT });
    });

    cy.log("break out the point by another dimension");
    H.cartesianChartCircle().eq(23).click({ force: true });
    H.popover().within(() => {
      cy.findByText("Break out by…").click();
      cy.findByText("Category").click();
      cy.findByText("Source").click();
    });
    cy.wait("@dataset");
    H.echartsContainer().findByText("User → Source").should("be.visible");

    cy.log("go back to the original chart");
    cy.go("back");
    H.echartsContainer().findByText("User → Source").should("not.exist");
    H.echartsContainer().findByText("Created At: Month").should("be.visible");

    cy.log("see the underlying records of the point");
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
