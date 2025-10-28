const { H } = cy;
import { USERS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  FIRST_COLLECTION_ID,
  ORDERS_MODEL_ID,
} from "e2e/support/cypress_sample_instance_data";
import type { StructuredQuestionDetails } from "e2e/support/helpers";

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

const ALL_METRICS = [
  ORDERS_SCALAR_METRIC,
  ORDERS_SCALAR_MODEL_METRIC,
  ORDERS_TIMESERIES_METRIC,
  PRODUCTS_SCALAR_METRIC,
  NON_NUMERIC_METRIC,
];

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

describe("scenarios > workbench > metrics", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  describe("no metrics", () => {
    it("should not hide the metrics links in the overview and bench nav", () => {
      cy.visit("/bench/overview");
      H.benchNavMenuButton().click();
      H.benchNavItem("Metrics").should("be.visible");
      H.benchNavMenuButton().click();

      H.main().findByText("Metrics").should("be.visible").click();

      cy.location("pathname").should("eq", "/bench/metric");
      H.benchSidebar().findByText("No metrics found").should("be.visible");
      H.newMetricButton().should("be.visible").click();

      H.modal().findByText("Pick your starting data").should("be.visible");
    });

    // FIXME: unskip this test once UXW-2155 is implemented
    it.skip("should not show the create metric button if the user does not have data access", () => {
      cy.signInAsSandboxedUser();
      cy.visit("/bench/metric");
      H.newMetricButton().should("not.be.visible");
    });

    it("user without a collection access should still be able to create and save a metric in his own personal collection", () => {
      cy.intercept("POST", "/api/card").as("createMetric");

      cy.signIn("nocollection");
      cy.visit("/bench/metric");

      H.newMetricButton().should("be.visible").click();
      cy.findByTestId("entity-picker-modal").findByText("People").click();

      H.benchMainPaneHeader()
        // .should("contain", "New metric") // FIXME: uncomment once we add the metric name to the header
        .button("Save");
      cy.wait(300); // FIXME: remove this hack by refactoring the save
      H.benchMainPaneHeader().button("Save").click();

      H.modal()
        .should("contain", "Save metric")
        .and("contain", H.getPersonalCollectionName(USERS["nocollection"]))
        .button("Save")
        .click();

      cy.wait("@createMetric");
      cy.location("pathname").should("match", /^\/bench\/metric\/\d+$/);
    });
  });

  describe("multiple metrics", () => {
    it("can browse metrics", () => {
      createMetrics(ALL_METRICS);
      cy.visit("/bench/metric");
      H.benchNavMenuButton()
        .should("have.text", "Metrics")
        .should("be.visible");

      // Expand all collections to see all metrics
      H.benchSidebar().findByText("First collection").click();

      ALL_METRICS.forEach((metric) => {
        H.benchSidebar().findByText(metric.name).should("be.visible");
      });
    });

    it("should navigate to the metric when clicking a metric title", () => {
      createMetrics([ORDERS_SCALAR_METRIC]);
      cy.visit("/bench/metric");
      H.benchSidebar()
        .findByText(ORDERS_SCALAR_METRIC.name)
        .should("be.visible")
        .click();
      cy.location("pathname").should("match", /^\/bench\/metric\/\d+$/);
      H.main().findByText("18,760");
    });

    it("should open the metric in a new tab when alt-clicking a metric", () => {
      createMetrics([ORDERS_SCALAR_METRIC]);
      cy.visit("/bench/metric");

      const macOSX = Cypress.platform === "darwin";
      H.setBenchListSorting("Alphabetical");

      // Verify the link has the correct href and target
      H.benchSidebar()
        .findByText(ORDERS_SCALAR_METRIC.name)
        .should("be.visible")
        .closest("a")
        .and("have.attr", "href")
        .and("match", /^\/bench\/metric\/\d+$/);

      // Click with modifier key
      H.benchSidebar().findByText(ORDERS_SCALAR_METRIC.name).click({
        metaKey: macOSX,
        ctrlKey: !macOSX,
      });

      // the page did not navigate on this page
      cy.location("pathname").should("eq", "/bench/metric");

      // TODO: implement this and verify for tree view UXW-2154
    });

    it("should be possible to view metrics in alphabetical order or by collection", () => {
      createMetrics(
        ALL_METRICS.slice(0, 4).map((metric, index) => ({
          ...metric,
          name: `Metric ${alphabet[index]}`,
          description: `Description ${alphabet[25 - index]}`,
        })),
      );

      cy.visit("/bench/metric");

      H.setBenchListSorting("Alphabetical");
      H.benchSidebarListItem(0).should("contain", "Metric A");
      H.benchSidebarListItem(1).should("contain", "Metric B");
      H.benchSidebarListItem(2).should("contain", "Metric C");
      H.benchSidebarListItem(3).should("contain", "Metric D");

      H.setBenchListSorting("By collection");

      // Expand the only collection
      H.benchSidebarTreeItems().findByText("First collection").click();

      H.benchSidebarTreeItem(0).should("contain", "First collection");
      H.benchSidebarTreeItem(1).should("contain", "Metric B");
      H.benchSidebarTreeItem(2).should("contain", "Metric A");
      H.benchSidebarTreeItem(3).should("contain", "Metric C");
      H.benchSidebarTreeItem(4).should("contain", "Metric D");
    });
  });

  describe("dot menu", () => {
    // FIXME: No bookmarking anymore, probably remove this test
    it.skip("should be possible to bookmark a metrics from the dot menu", () => {
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

    // FIXME: No such item — add or remove this test
    it.skip("should be possible to navigate to the collection from the dot menu", () => {
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

      cy.visit("/bench/metric");
      H.benchSidebarTreeItem(0).icon("ellipsis").click();
      H.popover().findByText("Move to trash").should("be.visible").click();
      H.modal().button("Move to trash").click();

      H.benchSidebar().findByText("No metrics found").should("be.visible");
    });

    describe("when the user does not have write access", () => {
      it("should not be possible to trash a metric from the dot menu when the user does not have write access", () => {
        createMetrics([ORDERS_SCALAR_METRIC]);
        cy.signIn("readonly");

        cy.visit("/bench/metric");

        H.benchSidebarTreeItem(0).icon("ellipsis").click();
        H.popover()
          .findByText("Move to trash")
          .closest("button")
          .should("be.disabled");
      });

      // FIXME: No such item — add or remove this test
      it.skip("should be possible to navigate to the collection from the dot menu", () => {
        createMetrics([ORDERS_SCALAR_METRIC]);
        cy.signIn("readonly");

        cy.visit("/bench/metric");

        H.benchSidebarTreeItem(0).icon("ellipsis").click();
        H.popover().findByText("Open collection").should("be.visible").click();

        cy.location("pathname").should("eq", "/collection/root");
      });

      // FIXME: No such item — add or remove this test
      it.skip("should be possible to bookmark a metrics from the dot menu", () => {
        createMetrics([ORDERS_SCALAR_METRIC]);
        cy.signIn("readonly");

        cy.visit("/bench/metric");

        shouldNotHaveBookmark(ORDERS_SCALAR_METRIC.name);

        H.benchSidebarTreeItem(0).icon("ellipsis").click();
        H.popover().findByText("Bookmark").should("be.visible").click();

        shouldHaveBookmark(ORDERS_SCALAR_METRIC.name);

        metricsTable().findByLabelText("Metric options").click();
        H.popover()
          .findByText("Remove from bookmarks")
          .should("be.visible")
          .click();

        shouldNotHaveBookmark(ORDERS_SCALAR_METRIC.name);

        H.benchSidebarTreeItem(0).icon("ellipsis").click();
        H.popover().findByText("Bookmark").should("be.visible");
      });
    });
  });

  // FIXME: New UX is different, probably remove this section
  describe.skip("verified metrics", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
    });

    // FIXME: New UX is different, probably remove this test
    it("should not show the verified metrics filter when there are no verified metrics", () => {
      createMetrics();
      cy.visit("/browse/metrics");

      cy.findByLabelText("Table of metrics").should("be.visible");

      cy.findByLabelText(/show.*verified.*metrics/i).should("not.exist");
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
      cy.get<{ request: Request }>("@setSetting").should((xhr) => {
        expect(xhr.request.body).to.deep.equal({ value: false });
      });

      findMetric(ORDERS_SCALAR_METRIC.name).should("be.visible");
      findMetric(ORDERS_SCALAR_MODEL_METRIC.name).should("be.visible");

      toggleVerifiedMetricsFilter();
      cy.get<{ request: Request }>("@setSetting").should((xhr) => {
        expect(xhr.request.body).to.deep.equal({ value: true });
      });
      cy.wait("@setSetting");

      findMetric(ORDERS_SCALAR_METRIC.name).should("be.visible");
      findMetric(ORDERS_SCALAR_MODEL_METRIC.name).should("not.exist");

      unverifyMetric(ORDERS_SCALAR_METRIC);

      findMetric(ORDERS_SCALAR_METRIC.name).should("be.visible");
      findMetric(ORDERS_SCALAR_MODEL_METRIC.name).should("be.visible");
    });

    it("should respect the user setting on whether to only show verified metrics", () => {
      cy.intercept("GET", "/api/session/properties", (req) => {
        req.continue((res) => {
          res.body["browse-filter-only-verified-metrics"] = true;
          res.send();
        });
      });

      createMetrics([ORDERS_SCALAR_METRIC, ORDERS_SCALAR_MODEL_METRIC]);
      cy.visit("/browse/metrics");
      verifyMetric(ORDERS_SCALAR_METRIC);

      cy.findByRole("switch", { name: /show.*verified.*metrics/i }).should(
        "have.attr",
        "aria-selected",
        "true",
      );

      cy.intercept("GET", "/api/session/properties", (req) => {
        req.continue((res) => {
          res.body["browse-filter-only-verified-metrics"] = true;
          res.send();
        });
      });

      cy.visit("/browse/metrics");
      cy.findByRole("switch", { name: /show.*verified.*metrics/i }).should(
        "have.attr",
        "aria-selected",
        "false",
      );
    });
  });
});

function createMetrics(
  metrics: StructuredQuestionDetailsWithName[] = ALL_METRICS,
) {
  metrics.forEach((metric) => H.createQuestion(metric));
}

function metricsTable() {
  return cy.findByLabelText("Table of metrics").should("be.visible");
}

function findMetric(name: string) {
  return metricsTable().findByText(name);
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

  cy.findByLabelText("Move, trash, and more…").click();
  H.popover().findByText("Verify this metric").click();

  H.navigationSidebar()
    .findByRole("listitem", { name: "Browse metrics" })
    .click();
}

function unverifyMetric(metric: StructuredQuestionDetailsWithName) {
  metricsTable().findByText(metric.name).should("be.visible").click();

  cy.findByLabelText("Move, trash, and more…").click();
  H.popover().findByText("Remove verification").click();

  H.navigationSidebar()
    .findByRole("listitem", { name: "Browse metrics" })
    .click();
}

function toggleVerifiedMetricsFilter() {
  cy.findByLabelText(/show.*verified.*metrics/i).click();
}
