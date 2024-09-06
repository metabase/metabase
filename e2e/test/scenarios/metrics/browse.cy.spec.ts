import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  FIRST_COLLECTION_ID,
  ORDERS_MODEL_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  type StructuredQuestionDetails,
  assertIsEllipsified,
  createQuestion,
  main,
  navigationSidebar,
  restore,
} from "e2e/support/helpers";

const { ORDERS_ID, ORDERS, PRODUCTS_ID } = SAMPLE_DATABASE;

type StructuredQuestionDetailsWithName = StructuredQuestionDetails & {
  name: string;
};

const ORDERS_SCALAR_METRIC: StructuredQuestionDetailsWithName = {
  name: "Count of orders",
  type: "metric",
  description: "A metric",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
  },
  display: "scalar",
};

const ORDERS_SCALAR_MODEL_METRIC: StructuredQuestionDetailsWithName = {
  name: "Orders model metric",
  type: "metric",
  description: "A metric",
  query: {
    "source-table": `card__${ORDERS_MODEL_ID}`,
    aggregation: [["count"]],
  },
  display: "scalar",
  collection_id: FIRST_COLLECTION_ID as number,
};

const ORDERS_TIMESERIES_METRIC: StructuredQuestionDetailsWithName = {
  name: "Count of orders over time",
  type: "metric",
  description: "A metric",
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

const PRODUCTS_SCALAR_METRIC: StructuredQuestionDetailsWithName = {
  name: "Count of products",
  type: "metric",
  description: "A metric",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
  },
  display: "scalar",
};

const ALL_METRICS = [
  ORDERS_SCALAR_METRIC,
  ORDERS_SCALAR_MODEL_METRIC,
  ORDERS_TIMESERIES_METRIC,
  PRODUCTS_SCALAR_METRIC,
];

function createMetrics(
  metrics: StructuredQuestionDetailsWithName[] = ALL_METRICS,
) {
  metrics.forEach(metric => createQuestion(metric));
}

function metricsTable() {
  return cy.findByLabelText("Table of metrics").should("be.visible");
}

function findMetric(name: string) {
  return metricsTable().findByText(name).should("be.visible");
}

function getMetricsTableItem(index: number) {
  return metricsTable().findAllByTestId("metric-name").eq(index);
}

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

describe("scenarios > browse > metrics", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  describe("no metrics", () => {
    it("should not hide the browse metrics link in the sidebar", () => {
      cy.visit("/");
      navigationSidebar().findByText("Metrics").should("be.visible");
    });

    it("should show the empty metrics page", () => {
      cy.visit("/browse/metrics");
      main()
        .findByText(
          "Metrics help you summarize and analyze your data effortlessly.",
        )
        .should("be.visible");
    });
  });

  describe("multiple metrics", () => {
    it("can browse metrics", () => {
      createMetrics(ALL_METRICS);
      cy.visit("/browse/metrics");
      navigationSidebar().findByText("Metrics").should("be.visible");

      ALL_METRICS.forEach(metric => {
        findMetric(metric.name).should("be.visible");
      });
    });

    it("should navigate to the metric when clicking a metric title", () => {
      createMetrics([ORDERS_SCALAR_METRIC]);
      cy.visit("/browse/metrics");
      findMetric(ORDERS_SCALAR_METRIC.name).should("be.visible").click();
      cy.location("pathname").should("match", /^\/metric\/\d+-.*$/);
    });

    it("should navigate to that collection when clicking a collection title", () => {
      createMetrics([ORDERS_SCALAR_METRIC]);
      cy.visit("/browse/metrics");
      findMetric(ORDERS_SCALAR_METRIC.name).should("be.visible");

      metricsTable().findByText("Our analytics").should("be.visible").click();

      cy.location("pathname").should("eq", "/collection/root");
    });

    it("should open the collections in a new tab when alt-clicking a metric", () => {
      cy.on("window:before:load", win => {
        // prevent Cypress opening in a new window/tab and spy on this method
        cy.stub(win, "open").as("open");
      });

      createMetrics([ORDERS_SCALAR_METRIC]);
      cy.visit("/browse/metrics");

      const macOSX = Cypress.platform === "darwin";
      findMetric(ORDERS_SCALAR_METRIC.name).should("be.visible").click({
        metaKey: macOSX,
        ctrlKey: !macOSX,
      });

      cy.get("@open").should("have.been.calledOnce");
      cy.get("@open").should(
        "have.been.calledWithMatch",
        /^\/question\/\d+-.*$/,
        "_blank",
      );

      // the page did not navigate on this page
      cy.location("pathname").should("eq", "/browse/metrics");
    });

    it("should render truncated markdown in the table", () => {
      const description =
        "This is a _very_ **long description** that should be truncated";

      createMetrics([
        {
          ...ORDERS_SCALAR_METRIC,
          description,
        },
      ]);

      cy.visit("/browse/metrics");

      metricsTable()
        .findByText(/This is a/)
        .should("be.visible")
        .then(el => assertIsEllipsified(el[0]));

      metricsTable()
        .findByText(/This is a/)
        .realHover();

      cy.findAllByText(/should be truncated/).should("have.length", 2);
    });

    it("should be possible to sort the metrics", () => {
      createMetrics(
        ALL_METRICS.map((metric, index) => ({
          ...metric,
          name: `Metric ${alphabet[index]}`,
          description: `Description ${alphabet[25 - index]}`,
        })),
      );

      cy.visit("/browse/metrics");

      getMetricsTableItem(0).should("contain", "Metric A");
      getMetricsTableItem(1).should("contain", "Metric B");
      getMetricsTableItem(2).should("contain", "Metric C");
      getMetricsTableItem(3).should("contain", "Metric D");

      metricsTable().findByText("Description").click();

      getMetricsTableItem(0).should("contain", "Metric D");
      getMetricsTableItem(1).should("contain", "Metric C");
      getMetricsTableItem(2).should("contain", "Metric B");
      getMetricsTableItem(3).should("contain", "Metric A");

      metricsTable().findByText("Collection").click();

      getMetricsTableItem(0).should("contain", "Metric B");
      getMetricsTableItem(1).should("contain", "Metric A");
      getMetricsTableItem(2).should("contain", "Metric C");
      getMetricsTableItem(3).should("contain", "Metric D");
    });
  });
});
