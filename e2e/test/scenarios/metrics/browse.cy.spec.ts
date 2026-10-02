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
  collection_id: FIRST_COLLECTION_ID,
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
  });

  describe("no metrics", () => {
    it("should show the empty metrics page, discard a new metric on cancel (metabase#48024), and hide create actions from users who cannot create queries", () => {
      const emptyStateText =
        "Create Metrics to define the official way to calculate important numbers for your team";

      cy.visit("/");
      H.navigationSidebar().findByText("Metrics").should("be.visible").click();
      cy.location("pathname").should("eq", "/browse/metrics");
      cy.findByTestId("browse-metrics-header")
        .findByLabelText("Create a new metric")
        .should("be.visible");
      H.main().within(() => {
        cy.findByText(emptyStateText).should("be.visible");
        cy.findByText("Create metric").should("be.visible").click();
      });
      cy.location("pathname").should("eq", "/metric/new");

      cy.log("cancelling a new metric asks to discard it");
      H.MetricPage.queryEditor().should("be.visible");
      H.miniPicker().within(() => {
        cy.findByText("Sample Database").click();
        cy.findByText("Orders").click();
      });
      H.MetricPage.cancelButton().click();
      H.modal().within(() => {
        cy.findByText("Discard your changes?").should("be.visible");
        cy.button("Discard changes").click();
      });
      cy.location("pathname").should("eq", "/browse/metrics");
      H.main().findByText(emptyStateText).should("be.visible");

      cy.log(
        "create actions are hidden from a sandboxed user who cannot create queries",
      );
      cy.signInAsSandboxedUser();
      cy.visit("/browse/metrics");
      H.main().within(() => {
        cy.findByText(emptyStateText).should("be.visible");
        cy.findByText("Create metric").should("not.exist");
      });
      cy.findByTestId("browse-metrics-header")
        .findByLabelText("Create a new metric")
        .should("not.exist");
    });

    it("user without a collection access should still be able to create and save a metric in his own personal collection", () => {
      cy.intercept("POST", "/api/card").as("createMetric");

      cy.signIn("nocollection");
      cy.visit("/browse/metrics");

      cy.findByTestId("browse-metrics-header")
        .findByLabelText("Create a new metric")
        .click();
      H.MetricPage.queryEditor().should("be.visible");
      H.miniPicker().within(() => {
        cy.findByText("Sample Database").click();
        cy.findByText("People").click();
      });
      H.MetricPage.saveButton().click();
      H.modal().within(() => {
        cy.findByPlaceholderText("What is the name of your metric?").type(
          "My metric",
        );
        cy.findByText("Save your metric");
        cy.findByText(H.getPersonalCollectionName(USERS["nocollection"]));
        cy.button("Save").click();
      });

      cy.wait("@createMetric");
      H.MetricPage.aboutPage().should("be.visible");
      cy.location("pathname").should("match", /^\/metric\/\d+/);
    });
  });

  describe("multiple metrics", () => {
    it("should open a metric in a new tab on meta-click, and navigate to its collection and to the metric on click", () => {
      cy.on("window:before:load", (win) => {
        // prevent Cypress opening in a new window/tab and spy on this method
        cy.stub(win, "open").as("open");
      });

      createMetrics([ORDERS_SCALAR_METRIC]);
      cy.visit("/browse/metrics");

      cy.log("meta-click opens the metric in a new tab");
      findMetric(ORDERS_SCALAR_METRIC.name)
        .should("be.visible")
        .click(H.holdMetaKey);

      cy.get("@open").should("have.been.calledOnce");
      cy.get("@open").should(
        "have.been.calledWithMatch",
        /^\/metric\//,
        "_blank",
      );

      // the page did not navigate on this page
      cy.location("pathname").should("eq", "/browse/metrics");

      cy.log("clicking the collection navigates to it");
      metricsTable().findByText("Our analytics").should("be.visible").click();
      cy.location("pathname").should("eq", "/collection/root");

      cy.log("clicking the metric navigates to it");
      cy.visit("/browse/metrics");
      findMetric(ORDERS_SCALAR_METRIC.name).should("be.visible").click();
      cy.location("pathname").should("match", /^\/metric\//);
      H.MetricPage.aboutPage().should("be.visible");
    });

    it("should render truncated name and markdown in the table", () => {
      const name =
        "A very long metric name that should be truncated by the metrics table because it does not fit within the name column";
      const description =
        "This is a _very_ **long description** that should be truncated by the metrics table because it is really very long.";

      createMetrics([
        ...ALL_METRICS,
        {
          ...ORDERS_SCALAR_METRIC,
          name,
          description,
        },
      ]);

      cy.visit("/browse/metrics");
      H.navigationSidebar().findByText("Metrics").should("be.visible");

      ALL_METRICS.forEach((metric) => {
        findMetric(metric.name).should("be.visible");
      });

      metricsTable()
        .findByText(name)
        .should("be.visible")
        .then((el) => H.assertIsEllipsified(el[0]));

      metricsTable()
        .findByText(/This is a/)
        .should("be.visible")
        .then((el) => H.assertIsEllipsified(el[0]));

      metricsTable()
        .findByText(/This is a/)
        .realHover();

      H.tooltip().within(() => {
        cy.findByText(/should be truncated/).should("be.visible");
        cy.get("strong").should("have.text", "long description");
      });
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
    beforeEach(() => {
      H.resetSnowplow();
      cy.signInAsAdmin();
      H.enableTracking();
      cy.signInAsNormalUser();
    });

    afterEach(() => {
      H.expectNoBadSnowplowEvents();
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

    it("should be possible to bookmark, trash, and restore a metric from the dot menu when the user has write access", () => {
      createMetrics([ORDERS_SCALAR_METRIC]);

      cy.visit("/browse/metrics");

      cy.log("bookmark and unbookmark");
      metricsTable().findByLabelText("Metric options").click();
      H.popover().findByText("Bookmark").should("be.visible").click();

      shouldHaveBookmark(ORDERS_SCALAR_METRIC.name);
      H.expectUnstructuredSnowplowEvent({
        event: "bookmark_added",
        event_detail: "metric",
        triggered_from: "browse_metrics",
      });

      metricsTable().findByLabelText("Metric options").click();
      H.popover()
        .findByText("Remove from bookmarks")
        .should("be.visible")
        .click();

      shouldNotHaveBookmark(ORDERS_SCALAR_METRIC.name);

      cy.log("trash and restore");
      metricsTable().findByLabelText("Metric options").click();
      H.popover().findByText("Bookmark").should("be.visible");
      H.popover().findByText("Move to trash").should("be.visible").click();

      H.main()
        .findByText(
          "Create Metrics to define the official way to calculate important numbers for your team",
        )
        .should("be.visible");

      H.navigationSidebar().findByText("Trash").should("be.visible").click();
      cy.intercept("/api/bookmark").as("bookmark"); // anti-flake guard
      cy.button("Actions").click();
      H.popover().findByText("Restore").should("be.visible").click();

      H.main().findByText("Nothing here").should("be.visible");
      cy.wait("@bookmark");

      H.navigationSidebar().findByText("Metrics").should("be.visible").click();
      metricsTable().findByText(ORDERS_SCALAR_METRIC.name).should("be.visible");
    });

    describe("when the user does not have write access", () => {
      it("should be possible to bookmark a metric and navigate to its collection, but not trash it, from the dot menu", () => {
        createMetrics([ORDERS_SCALAR_METRIC]);
        cy.signIn("readonly");

        cy.visit("/browse/metrics");

        cy.log("trash is not offered");
        metricsTable().findByLabelText("Metric options").click();
        H.popover().within(() => {
          cy.findByText("Bookmark").should("be.visible");
          cy.findByText("Move to trash").should("not.exist");
        });

        cy.log("bookmark and unbookmark");
        H.popover().findByText("Bookmark").click();

        shouldHaveBookmark(ORDERS_SCALAR_METRIC.name);

        metricsTable().findByLabelText("Metric options").click();
        H.popover()
          .findByText("Remove from bookmarks")
          .should("be.visible")
          .click();

        shouldNotHaveBookmark(ORDERS_SCALAR_METRIC.name);

        cy.log("open collection");
        metricsTable().findByLabelText("Metric options").click();
        H.popover().findByText("Bookmark").should("be.visible");
        H.popover().findByText("Open collection").should("be.visible").click();

        cy.location("pathname").should("eq", "/collection/root");
      });
    });
  });

  describe("verified metrics", () => {
    beforeEach(() => {
      cy.signInAsAdmin();
      H.activateToken("pro-self-hosted");
    });

    it("should show the verified metrics filter when there are verified metrics, and persist its user setting", () => {
      cy.intercept(
        "PUT",
        "/api/setting/browse-filter-only-verified-metrics",
      ).as("setSetting");

      createMetrics([ORDERS_SCALAR_METRIC, ORDERS_SCALAR_MODEL_METRIC]);
      cy.visit("/browse/metrics");

      findMetric(ORDERS_SCALAR_METRIC.name).should("be.visible");
      findMetric(ORDERS_SCALAR_MODEL_METRIC.name).should("be.visible");
      cy.findByLabelText(/show.*verified.*metrics/i).should("not.exist");

      verifyMetric(ORDERS_SCALAR_METRIC);

      verifiedMetricsSwitch().should("have.attr", "aria-selected", "true");
      findMetric(ORDERS_SCALAR_METRIC.name).should("be.visible");
      findMetric(ORDERS_SCALAR_MODEL_METRIC.name).should("not.exist");

      toggleVerifiedMetricsFilter();
      cy.wait("@setSetting")
        .its("request.body")
        .should("deep.equal", { value: false });

      findMetric(ORDERS_SCALAR_METRIC.name).should("be.visible");
      findMetric(ORDERS_SCALAR_MODEL_METRIC.name).should("be.visible");

      cy.log("the setting survives a reload");
      cy.reload();
      verifiedMetricsSwitch().should("have.attr", "aria-selected", "false");
      findMetric(ORDERS_SCALAR_METRIC.name).should("be.visible");
      findMetric(ORDERS_SCALAR_MODEL_METRIC.name).should("be.visible");

      toggleVerifiedMetricsFilter();
      cy.wait("@setSetting")
        .its("request.body")
        .should("deep.equal", { value: true });

      findMetric(ORDERS_SCALAR_METRIC.name).should("be.visible");
      findMetric(ORDERS_SCALAR_MODEL_METRIC.name).should("not.exist");

      cy.reload();
      verifiedMetricsSwitch().should("have.attr", "aria-selected", "true");
      findMetric(ORDERS_SCALAR_METRIC.name).should("be.visible");
      findMetric(ORDERS_SCALAR_MODEL_METRIC.name).should("not.exist");

      unverifyMetric(ORDERS_SCALAR_METRIC);

      findMetric(ORDERS_SCALAR_METRIC.name).should("be.visible");
      findMetric(ORDERS_SCALAR_MODEL_METRIC.name).should("be.visible");
    });
  });
});

function metricsTable() {
  return cy.findByLabelText("Table of metrics").should("be.visible");
}

function findMetric(name: string) {
  return metricsTable().findByText(name);
}

function getMetricsTableItem(index: number) {
  // eslint-disable-next-line metabase/no-unsafe-element-filtering
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
  H.MetricPage.aboutPage().should("be.visible");

  H.MetricPage.moreMenu().click();
  H.popover().findByText("Verify this metric").click();
  cy.icon("verified").should("be.visible");
  H.navigationSidebar()
    .findByRole("listitem", { name: "Browse metrics" })
    .click();
}

function unverifyMetric(metric: StructuredQuestionDetailsWithName) {
  metricsTable().findByText(metric.name).should("be.visible").click();
  H.MetricPage.aboutPage().should("be.visible");

  H.MetricPage.moreMenu().click();
  H.popover().findByText("Remove verification").click();
  cy.icon("verified").should("not.exist");
  H.navigationSidebar()
    .findByRole("listitem", { name: "Browse metrics" })
    .click();
}

function verifiedMetricsSwitch() {
  return cy.findByRole("switch", { name: /show.*verified.*metrics/i });
}

function toggleVerifiedMetricsFilter() {
  cy.findByLabelText(/show.*verified.*metrics/i).click();
}

function createMetrics(metrics: StructuredQuestionDetailsWithName[]) {
  metrics.forEach((metric) => H.createQuestion(metric));
}
