import { H } from "e2e/support";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  FIRST_COLLECTION_ID,
  ORDERS_MODEL_ID,
} from "e2e/support/cypress_sample_instance_data";

const { ORDERS_ID, ORDERS, PRODUCTS_ID, PRODUCTS } = SAMPLE_DATABASE;

type StructuredQuestionDetailsWithName = H.StructuredQuestionDetails & {
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

const ALL_METRICS = [
  ORDERS_SCALAR_METRIC,
  ORDERS_SCALAR_MODEL_METRIC,
  ORDERS_TIMESERIES_METRIC,
  PRODUCTS_SCALAR_METRIC,
  NON_NUMERIC_METRIC,
];

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

describe("scenarios > browse > metrics", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  describe("no metrics", () => {
    it("should not hide the browse metrics link in the sidebar", () => {
      cy.visit("/");
      H.navigationSidebar().findByText("Metrics").should("be.visible");
    });

    it("should show the empty metrics page", () => {
      cy.visit("/browse/metrics");
      H.main().within(() => {
        cy.findByText(
          "Create Metrics to define the official way to calculate important numbers for your team",
        ).should("be.visible");
        cy.findByText("Create metric").should("be.visible").click();
      });
      cy.location("pathname").should("eq", "/metric/query");
    });

    it("should not show the create metric button if the user does not have data access", () => {
      cy.signInAsSandboxedUser();
      cy.visit("/browse/metrics");
      H.main().within(() => {
        cy.findByText(
          "Create Metrics to define the official way to calculate important numbers for your team",
        ).should("be.visible");
        cy.findByText("Create metric").should("not.exist");
      });
    });
  });

  describe("multiple metrics", () => {
    it("can browse metrics", () => {
      createMetrics(ALL_METRICS);
      cy.visit("/browse/metrics");
      H.navigationSidebar().findByText("Metrics").should("be.visible");

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
        "This is a _very_ **long description** that should be truncated by the metrics table because it is really very long.";

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
        .then(el => H.assertIsEllipsified(el[0]));

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
      H.popover().findByText("Bookmark").should("be.visible").click();

      shouldHaveBookmark(ORDERS_SCALAR_METRIC.name);

      metricsTable().findByLabelText("Metric options").click();
      H.popover()
        .findByText("Remove from bookmarks")
        .should("be.visible")
        .click();

      shouldNotHaveBookmark(ORDERS_SCALAR_METRIC.name);

      metricsTable().findByLabelText("Metric options").click();
      H.popover().findByText("Bookmark").should("be.visible");
    });

    it("should be possible to navigate to the collection from the dot menu", () => {
      createMetrics([ORDERS_SCALAR_MODEL_METRIC]);

      cy.visit("/browse/metrics");

      metricsTable().findByLabelText("Metric options").click();
      H.popover().findByText("Open collection").should("be.visible").click();

      cy.location("pathname").should(
        "match",
        new RegExp(`^/collection/${FIRST_COLLECTION_ID}`),
      );
    });

    it("should be possible to trash a metric from the dot menu when the user has write access", () => {
      createMetrics([ORDERS_SCALAR_METRIC]);

      cy.visit("/browse/metrics");

      metricsTable().findByLabelText("Metric options").click();
      H.popover().findByText("Move to trash").should("be.visible").click();

      H.main()
        .findByText(
          "Create Metrics to define the official way to calculate important numbers for your team",
        )
        .should("be.visible");

      H.navigationSidebar().findByText("Trash").should("be.visible").click();
      cy.button("Actions").click();
      H.popover().findByText("Restore").should("be.visible").click();

      H.navigationSidebar().findByText("Metrics").should("be.visible").click();
      metricsTable().findByText(ORDERS_SCALAR_METRIC.name).should("be.visible");
    });

    describe("when the user does not have write access", () => {
      it("should not be possible to trash a metric from the dot menu when the user does not have write access", () => {
        createMetrics([ORDERS_SCALAR_METRIC]);
        cy.signIn("readonly");

        cy.visit("/browse/metrics");

        metricsTable().findByLabelText("Metric options").click();
        H.popover().findByText("Move to trash").should("not.exist");
      });

      it("should be possible to navigate to the collection from the dot menu", () => {
        createMetrics([ORDERS_SCALAR_METRIC]);
        cy.signIn("readonly");

        cy.visit("/browse/metrics");

        metricsTable().findByLabelText("Metric options").click();
        H.popover().findByText("Open collection").should("be.visible").click();

        cy.location("pathname").should("eq", "/collection/root");
      });

      it("should be possible to bookmark a metrics from the dot menu", () => {
        createMetrics([ORDERS_SCALAR_METRIC]);
        cy.signIn("readonly");

        cy.visit("/browse/metrics");

        shouldNotHaveBookmark(ORDERS_SCALAR_METRIC.name);

        metricsTable().findByLabelText("Metric options").click();
        H.popover().findByText("Bookmark").should("be.visible").click();

        shouldHaveBookmark(ORDERS_SCALAR_METRIC.name);

        metricsTable().findByLabelText("Metric options").click();
        H.popover()
          .findByText("Remove from bookmarks")
          .should("be.visible")
          .click();

        shouldNotHaveBookmark(ORDERS_SCALAR_METRIC.name);

        metricsTable().findByLabelText("Metric options").click();
        H.popover().findByText("Bookmark").should("be.visible");
      });
    });
  });

  describe("verified metrics", () => {
    H.describeEE("on enterprise", () => {
      beforeEach(() => {
        cy.signInAsAdmin();
        H.setTokenFeatures("all");
      });

      it("should not the verified metrics filter when there are no verified metrics", () => {
        createMetrics();
        cy.visit("/browse/metrics");

        cy.findByLabelText("Filters").should("not.exist");
      });

      it("should show the verified metrics filter when there are verified metrics", () => {
        cy.intercept(
          "PUT",
          "/api/setting/browse-filter-only-verified-metrics",
        ).as("setSetting");

        createMetrics([ORDERS_SCALAR_METRIC, ORDERS_SCALAR_MODEL_METRIC]);
        cy.visit("/browse/metrics");

        findMetric(ORDERS_SCALAR_METRIC.name).should("be.visible");
        findMetric(ORDERS_SCALAR_MODEL_METRIC.name).should("be.visible");

        verifyMetric(ORDERS_SCALAR_METRIC);

        findMetric(ORDERS_SCALAR_METRIC.name).should("be.visible");
        findMetric(ORDERS_SCALAR_MODEL_METRIC.name).should("not.exist");

        toggleVerifiedMetricsFilter();
        cy.get<{ request: Request }>("@setSetting").should(xhr => {
          expect(xhr.request.body).to.deep.equal({ value: false });
        });

        findMetric(ORDERS_SCALAR_METRIC.name).should("be.visible");
        findMetric(ORDERS_SCALAR_MODEL_METRIC.name).should("be.visible");

        toggleVerifiedMetricsFilter();
        cy.get<{ request: Request }>("@setSetting").should(xhr => {
          expect(xhr.request.body).to.deep.equal({ value: true });
        });
        cy.wait("@setSetting");

        findMetric(ORDERS_SCALAR_METRIC.name).should("be.visible");
        findMetric(ORDERS_SCALAR_MODEL_METRIC.name).should("not.exist");

        unverifyMetric(ORDERS_SCALAR_METRIC);

        findMetric(ORDERS_SCALAR_METRIC.name).should("be.visible");
        findMetric(ORDERS_SCALAR_MODEL_METRIC.name).should("be.visible");
      });

      it("should respect the user setting on wether or not to only show verified metrics", () => {
        cy.intercept("GET", "/api/session/properties", req => {
          req.continue(res => {
            res.body["browse-filter-only-verified-metrics"] = true;
            res.send();
          });
        });

        createMetrics([ORDERS_SCALAR_METRIC, ORDERS_SCALAR_MODEL_METRIC]);
        cy.visit("/browse/metrics");
        verifyMetric(ORDERS_SCALAR_METRIC);

        cy.findByLabelText("Filters").should("be.visible").click();
        H.popover()
          .findByLabelText("Show verified metrics only")
          .should("be.checked");

        cy.intercept("GET", "/api/session/properties", req => {
          req.continue(res => {
            res.body["browse-filter-only-verified-metrics"] = true;
            res.send();
          });
        });

        cy.visit("/browse/metrics");
        cy.findByLabelText("Filters").should("be.visible").click();
        H.popover()
          .findByLabelText("Show verified metrics only")
          .should("not.be.checked");
      });
    });
  });
});

function createMetrics(
  metrics: StructuredQuestionDetailsWithName[] = ALL_METRICS,
) {
  metrics.forEach(metric => H.createQuestion(metric));
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
  H.getSidebarSectionTitle(/Bookmarks/).should("be.visible");
  H.navigationSidebar().findByText(name).should("be.visible");
}

function shouldNotHaveBookmark(name: string) {
  H.getSidebarSectionTitle(/Bookmarks/).should("not.exist");
  H.navigationSidebar().findByText(name).should("not.exist");
}

function verifyMetric(metric: StructuredQuestionDetailsWithName) {
  metricsTable().findByText(metric.name).should("be.visible").click();

  cy.button("Move, trash, and more...").click();
  H.popover().findByText("Verify this metric").click();

  H.openNavigationSidebar();

  H.navigationSidebar()
    .findByRole("listitem", { name: "Browse metrics" })
    .click();
}

function unverifyMetric(metric: StructuredQuestionDetailsWithName) {
  metricsTable().findByText(metric.name).should("be.visible").click();

  cy.button("Move, trash, and more...").click();
  H.popover().findByText("Remove verification").click();

  H.openNavigationSidebar();

  H.navigationSidebar()
    .findByRole("listitem", { name: "Browse metrics" })
    .click();
}

function toggleVerifiedMetricsFilter() {
  cy.findByLabelText("Filters").should("be.visible").click();
  H.popover().findByText("Show verified metrics only").click();
  cy.findByLabelText("Filters").should("be.visible").click();
}
