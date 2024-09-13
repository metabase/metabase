import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ALL_USERS_GROUP_ID,
  FIRST_COLLECTION_ID,
  ORDERS_MODEL_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  type StructuredQuestionDetails,
  assertIsEllipsified,
  createNativeQuestion,
  createQuestion,
  describeEE,
  getSidebarSectionTitle,
  main,
  navigationSidebar,
  openNavigationSidebar,
  popover,
  restore,
  setTokenFeatures,
  tooltip,
} from "e2e/support/helpers";
import { DataPermissionValue } from "metabase/admin/permissions/types";

const { ORDERS_ID, ORDERS, PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

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

const NON_NUMERIC_METRIC: StructuredQuestionDetailsWithName = {
  name: "Max of product category",
  type: "metric",
  description: "A metric",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["max", ["field", PRODUCTS.CATEGORY, null]]],
  },
  display: "scalar",
};

const TEMPORAL_METRIC_WITH_SORT: StructuredQuestionDetailsWithName = {
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
    "order-by": [["asc", ["aggregation", 0]]],
  },
};

const SCALAR_METRIC_WITH_NO_VALUE: StructuredQuestionDetailsWithName = {
  name: "Scalar metric with no value",
  type: "metric",
  description: "A metric",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["max", ["field", ORDERS.TOTAL, {}]]],
    filter: ["=", ["field", ORDERS.TOTAL, {}], 3.333],
  },
};

const TIMESERIES_METRIC_WITH_NO_VALUE: StructuredQuestionDetailsWithName = {
  name: "Timeseries metric with no value",
  type: "metric",
  description: "A metric",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["max", ["field", ORDERS.TOTAL, {}]]],
    filter: ["=", ["field", ORDERS.TOTAL, {}], 3.333],
    breakout: [
      [
        "field",
        ORDERS.CREATED_AT,
        { "base-type": "type/DateTime", "temporal-unit": "month" },
      ],
    ],
  },
};

const ALL_METRICS = [
  ORDERS_SCALAR_METRIC,
  ORDERS_SCALAR_MODEL_METRIC,
  ORDERS_TIMESERIES_METRIC,
  PRODUCTS_SCALAR_METRIC,
  NON_NUMERIC_METRIC,
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
  return metricsTable().findByText(name);
}

function getMetricsTableItem(index: number) {
  return metricsTable().findAllByTestId("metric-name").eq(index);
}

function shouldHaveBookmark(name: string) {
  getSidebarSectionTitle(/Bookmarks/).should("be.visible");
  navigationSidebar().findByText(name).should("be.visible");
}

function shouldNotHaveBookmark(name: string) {
  getSidebarSectionTitle(/Bookmarks/).should("not.exist");
  navigationSidebar().findByText(name).should("not.exist");
}

function checkMetricValueAndTooltipExist(value: string, label: string) {
  metricsTable().findByText(value).should("be.visible");
  metricsTable().findByText(value).realHover();
  tooltip().should("contain", label);
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

      shouldNotHaveBookmark(ORDERS_SCALAR_METRIC.name);

      metricsTable().findByLabelText("Metric options").click();
      popover().findByText("Bookmark").should("be.visible").click();

      shouldHaveBookmark(ORDERS_SCALAR_METRIC.name);

      metricsTable().findByLabelText("Metric options").click();
      popover()
        .findByText("Remove from bookmarks")
        .should("be.visible")
        .click();

      shouldNotHaveBookmark(ORDERS_SCALAR_METRIC.name);

      metricsTable().findByLabelText("Metric options").click();
      popover().findByText("Bookmark").should("be.visible");
    });

    it("should be possible to navigate to the collection from the dot menu", () => {
      createMetrics([ORDERS_SCALAR_MODEL_METRIC]);

      cy.visit("/browse/metrics");

      metricsTable().findByLabelText("Metric options").click();
      popover().findByText("Open collection").should("be.visible").click();

      cy.location("pathname").should(
        "match",
        new RegExp(`^/collection/${FIRST_COLLECTION_ID}`),
      );
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

      navigationSidebar().findByText("Trash").should("be.visible").click();
      cy.button("Actions").click();
      popover().findByText("Restore").should("be.visible").click();

      navigationSidebar().findByText("Metrics").should("be.visible").click();
      metricsTable().findByText(ORDERS_SCALAR_METRIC.name).should("be.visible");
    });

    describe("when the user does not have write access", () => {
      it("should not be possible to trash a metric from the dot menu when the user does not have write access", () => {
        createMetrics([ORDERS_SCALAR_METRIC]);
        cy.signIn("readonly");

        cy.visit("/browse/metrics");

        metricsTable().findByLabelText("Metric options").click();
        popover().findByText("Move to trash").should("not.exist");
      });

      it("should be possible to navigate to the collection from the dot menu", () => {
        createMetrics([ORDERS_SCALAR_METRIC]);
        cy.signIn("readonly");

        cy.visit("/browse/metrics");

        metricsTable().findByLabelText("Metric options").click();
        popover().findByText("Open collection").should("be.visible").click();

        cy.location("pathname").should("eq", "/collection/root");
      });

      it("should be possible to bookmark a metrics from the dot menu", () => {
        createMetrics([ORDERS_SCALAR_METRIC]);
        cy.signIn("readonly");

        cy.visit("/browse/metrics");

        shouldNotHaveBookmark(ORDERS_SCALAR_METRIC.name);

        metricsTable().findByLabelText("Metric options").click();
        popover().findByText("Bookmark").should("be.visible").click();

        shouldHaveBookmark(ORDERS_SCALAR_METRIC.name);

        metricsTable().findByLabelText("Metric options").click();
        popover()
          .findByText("Remove from bookmarks")
          .should("be.visible")
          .click();

        shouldNotHaveBookmark(ORDERS_SCALAR_METRIC.name);

        metricsTable().findByLabelText("Metric options").click();
        popover().findByText("Bookmark").should("be.visible");
      });
    });
  });

  describe("scalar metric value", () => {
    it("should render a scalar metric's value in the table", () => {
      restore();
      cy.signInAsAdmin();
      createMetrics([ORDERS_SCALAR_METRIC]);
      cy.visit("/browse/metrics");

      checkMetricValueAndTooltipExist("18,760", "Overall");
    });

    it("should render a scalar metric's value in the table even when it's not a number", () => {
      restore();
      cy.signInAsAdmin();
      createMetrics([NON_NUMERIC_METRIC]);
      cy.visit("/browse/metrics");

      checkMetricValueAndTooltipExist("Widget", "Overall");
    });
  });

  describeEE("scalar metric value", () => {
    it("should not render a scalar metric's value when the user does not have permissions to see it", () => {
      cy.signInAsAdmin();
      createMetrics([ORDERS_SCALAR_METRIC]);

      setTokenFeatures("all");
      cy.updatePermissionsGraph({
        [ALL_USERS_GROUP_ID]: {
          [SAMPLE_DB_ID]: {
            "view-data": DataPermissionValue.BLOCKED,
          },
        },
      });

      cy.signInAsNormalUser();
      cy.visit("/browse/metrics");

      metricsTable().findByText("18,760").should("not.exist");
    });
  });

  describe("verified metrics", () => {
    describeEE("on enterprise", () => {
      beforeEach(() => {
        cy.signInAsAdmin();
        setTokenFeatures("all");
      });

      it("should not the verified metrics filter when there are no verified metrics", () => {
        createMetrics();
        cy.visit("/browse/metrics");

        cy.findByLabelText("Filters").should("not.exist");
      });

      it("should show the verified metrics filter when there are verified metrics", () => {
        createMetrics([ORDERS_SCALAR_METRIC, ORDERS_SCALAR_MODEL_METRIC]);
        cy.visit("/browse/metrics");

        findMetric(ORDERS_SCALAR_METRIC.name).should("be.visible");
        findMetric(ORDERS_SCALAR_MODEL_METRIC.name).should("be.visible");

        verifyMetric(ORDERS_SCALAR_METRIC);

        findMetric(ORDERS_SCALAR_METRIC.name).should("be.visible");
        findMetric(ORDERS_SCALAR_MODEL_METRIC.name).should("not.exist");

        toggleVerifiedMetricsFilter();

        findMetric(ORDERS_SCALAR_METRIC.name).should("be.visible");
        findMetric(ORDERS_SCALAR_MODEL_METRIC.name).should("be.visible");

        toggleVerifiedMetricsFilter();

        findMetric(ORDERS_SCALAR_METRIC.name).should("be.visible");
        findMetric(ORDERS_SCALAR_MODEL_METRIC.name).should("not.exist");

        unverifyMetric(ORDERS_SCALAR_METRIC);

        findMetric(ORDERS_SCALAR_METRIC.name).should("be.visible");
        findMetric(ORDERS_SCALAR_MODEL_METRIC.name).should("be.visible");
      });
    });
  });

  describe("temporal metric value", () => {
    it("should show the last value of a temporal metric", () => {
      cy.signInAsAdmin();
      createMetrics([ORDERS_TIMESERIES_METRIC]);
      cy.visit("/browse/metrics");

      checkMetricValueAndTooltipExist("344", "April 2026");
    });

    it("should show the last value of a temporal metric with a sort clause", () => {
      cy.signInAsAdmin();
      createMetrics([TEMPORAL_METRIC_WITH_SORT]);
      cy.visit("/browse/metrics");

      checkMetricValueAndTooltipExist("584", "January 2025");
    });

    it("should render an empty value for a scalar metric with no value", () => {
      cy.signInAsAdmin();
      createMetrics([SCALAR_METRIC_WITH_NO_VALUE]);
      cy.visit("/browse/metrics");

      findMetric(SCALAR_METRIC_WITH_NO_VALUE.name).should("be.visible");
      cy.findByTestId("metric-value").should("be.empty");
    });

    it("should render an empty value for a timeseries metric with no value", () => {
      cy.signInAsAdmin();
      createMetrics([TIMESERIES_METRIC_WITH_NO_VALUE]);
      cy.visit("/browse/metrics");

      findMetric(TIMESERIES_METRIC_WITH_NO_VALUE.name).should("be.visible");
      cy.findByTestId("metric-value").should("be.empty");
    });

    it("should render an empty value for metric with errors", () => {
      cy.signInAsAdmin();

      createNativeQuestion(
        {
          name: "Question with error",
          native: {
            query: "SELECT __syntax_error__;",
          },
        },
        { wrapId: true },
      ).then(id => {
        createMetrics([
          {
            name: "Metric with error",
            type: "metric",
            description: "A metric",
            query: {
              "source-table": `card__${id}`,
              aggregation: [["count"]],
            },
          },
        ]);
      });

      cy.visit("/browse/metrics");

      findMetric("Metric with error").should("be.visible");
      cy.findByTestId("metric-value").should("be.empty");
    });
  });

  describeEE("temporal metric value", () => {
    it("should not render a temporal metric's value when the user does not have permissions to see it", () => {
      cy.signInAsAdmin();
      createMetrics([ORDERS_TIMESERIES_METRIC]);

      setTokenFeatures("all");
      cy.updatePermissionsGraph({
        [ALL_USERS_GROUP_ID]: {
          [SAMPLE_DB_ID]: {
            "view-data": DataPermissionValue.BLOCKED,
          },
        },
      });

      cy.signInAsNormalUser();
      cy.visit("/browse/metrics");

      metricsTable().findByText("344").should("not.exist");
    });
  });
});

function verifyMetric(metric: StructuredQuestionDetailsWithName) {
  metricsTable().findByText(metric.name).should("be.visible").click();

  cy.button("Move, trash, and more...").click();
  popover().findByText("Verify this metric").click();

  openNavigationSidebar();

  navigationSidebar()
    .findByRole("listitem", { name: "Browse metrics" })
    .click();
}

function unverifyMetric(metric: StructuredQuestionDetailsWithName) {
  metricsTable().findByText(metric.name).should("be.visible").click();

  cy.button("Move, trash, and more...").click();
  popover().findByText("Remove verification").click();

  openNavigationSidebar();

  navigationSidebar()
    .findByRole("listitem", { name: "Browse metrics" })
    .click();
}

function toggleVerifiedMetricsFilter() {
  cy.findByLabelText("Filters").should("be.visible").click();
  popover().findByText("Show verified metrics only").click();
  cy.findByLabelText("Filters").should("be.visible").click();
}
