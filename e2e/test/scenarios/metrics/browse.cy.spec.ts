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
  popover,
  restore,
} from "e2e/support/helpers";

const { ORDERS_ID, ORDERS, PRODUCTS, PRODUCTS_ID, ACCOUNTS_ID, ACCOUNTS } =
  SAMPLE_DATABASE;

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

const PRODUCTS_TIMESERIES_METRIC: StructuredQuestionDetailsWithName = {
  name: "Count of products over time",
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

const PRODUCTS_BY_CATEGORY_METRIC: StructuredQuestionDetailsWithName = {
  name: "Count of products by category",
  type: "metric",
  description: "A metric",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [["field", PRODUCTS.CATEGORY, null]],
  },
};

const ORDERS_COUNT_BY_PRODUCT_METRIC: StructuredQuestionDetailsWithName = {
  name: "Count of orders by product",
  type: "metric",
  description: "A metric",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [["field", ORDERS.PRODUCT_ID, null]],
  },
};

const ACCOUNTS_TIMESERIES_METRIC: StructuredQuestionDetailsWithName = {
  name: "Count of accounts by day",
  type: "metric",
  description: "A metric",
  query: {
    "source-table": ACCOUNTS_ID,
    aggregation: [["count"]],
    breakout: [
      [
        "field",
        ACCOUNTS.CREATED_AT,
        { "base-type": "type/DateTime", "temporal-unit": "day" },
      ],
    ],
  },
  display: "line",
};

const ACCOUNTS_NON_TIME_METRIC: StructuredQuestionDetailsWithName = {
  name: "Count of accounts by city",
  type: "metric",
  description: "A metric",
  query: {
    "source-table": ACCOUNTS_ID,
    aggregation: [["count"]],
    breakout: [["field", ACCOUNTS.COUNTRY, null]],
  },
  display: "line",
};

const ACCOUNTS_SCALAR_METRIC: StructuredQuestionDetailsWithName = {
  name: "Count of accounts",
  type: "metric",
  description: "A metric",
  query: {
    "source-table": ACCOUNTS_ID,
    aggregation: [["count"]],
    breakout: [],
  },
  display: "line",
};

const ALL_METRICS = [
  ORDERS_SCALAR_METRIC,
  ORDERS_SCALAR_MODEL_METRIC,
  ORDERS_TIMESERIES_METRIC,
  PRODUCTS_SCALAR_METRIC,
  PRODUCTS_TIMESERIES_METRIC,
  PRODUCTS_BY_CATEGORY_METRIC,
  ORDERS_COUNT_BY_PRODUCT_METRIC,
  ACCOUNTS_TIMESERIES_METRIC,
  ACCOUNTS_NON_TIME_METRIC,
  ACCOUNTS_SCALAR_METRIC,
];

function createMetrics(
  metrics: StructuredQuestionDetailsWithName[] = ALL_METRICS,
) {
  return metrics.reduce(
    (acc: Cypress.Chainable, metric: StructuredQuestionDetailsWithName) => {
      return acc.then(ids => {
        // Wrap each id so we can return a list of all ids
        return createQuestion(metric, {
          wrapId: true,
        }).then(res => [...ids, res.body.id]);
      });
    },
    cy.wrap([]),
  );
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

function recentMetric(name: string) {
  return cy.findByTestId("recent-metric").contains(name);
}

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

describe("scenarios > browse > metrics", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  describe("no metrics", () => {
    it("should hide the browse metrics link in the sidebar", () => {
      cy.visit("/");
      navigationSidebar().findByText("Metrics").should("not.exist");
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
        ALL_METRICS.slice(0, 4).map((metric, index) => ({
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

  describe("dot menu", () => {
    it("should be possible to bookmark a metrics from the dot menu", () => {
      createMetrics([ORDERS_SCALAR_METRIC]);

      cy.visit("/browse/metrics");

      metricsTable().findByLabelText("Metric options").click();
      popover().findByText("Bookmark").should("be.visible").click();

      metricsTable().findByLabelText("Metric options").click();
      popover()
        .findByText("Remove from bookmarks")
        .should("be.visible")
        .click();

      metricsTable().findByLabelText("Metric options").click();
      popover().findByText("Bookmark").should("be.visible");
    });

    it("should be possible to navigate to the collection from the dot menu", () => {
      createMetrics([ORDERS_SCALAR_METRIC]);

      cy.visit("/browse/metrics");

      metricsTable().findByLabelText("Metric options").click();
      popover().findByText("Open collection").should("be.visible").click();

      cy.location("pathname").should("eq", "/collection/root");
    });

    it("should be possible to trash a metric from the dot menu when the user has write access", () => {
      createMetrics([ORDERS_SCALAR_METRIC]);

      cy.visit("/browse/metrics");

      metricsTable().findByLabelText("Metric options").click();
      popover().findByText("Move to trash").should("be.visible").click();

      main()
        .findByText(
          "Metrics help you summarize and analyze your data effortlessly.",
        )
        .should("be.visible");
    });

    it("should not be possible to trash a metric from the dot menu when the user does not have write access", () => {
      createMetrics([ORDERS_SCALAR_METRIC]);
      cy.signIn("readonly");

      cy.visit("/browse/metrics");

      metricsTable().findByLabelText("Metric options").click();
      popover().findByText("Move to trash").should("not.exist");
    });
  });

  describe("recent metrics", () => {
    it("should render recent metrics when there are enough metrics", () => {
      cy.signInAsAdmin();
      createMetrics(ALL_METRICS).then(ids => {
        ids.slice(0, 3).forEach((id: number) => {
          // Request the metric to make it show up in recents
          cy.request(`/api/card/${id}`);
        });
      });

      cy.visit("/browse/metrics");
      main().findByText("Recents").should("be.visible");
      recentMetric(ALL_METRICS[0].name).should("be.visible");
      recentMetric(ALL_METRICS[1].name).should("be.visible");
      recentMetric(ALL_METRICS[2].name).should("be.visible");
      recentMetric(ALL_METRICS[3].name).should("not.exist");
    });

    it("should not render recent metrics when there no recent metrics", () => {
      cy.signInAsAdmin();
      createMetrics(ALL_METRICS);

      cy.visit("/browse/metrics");
      main().findByText("Recents").should("not.exist");
    });

    it("should not render recent metrics when there are not enough metrics", () => {
      cy.signInAsAdmin();
      createMetrics(ALL_METRICS.slice(0, 4)).then(ids => {
        ids.slice(0, 3).forEach((id: number) => {
          // Request the metric to make it show up in recents
          cy.request(`/api/card/${id}`);
        });
      });

      cy.visit("/browse/metrics");
      main().findByText("Recents").should("not.exist");
    });
  });
});
