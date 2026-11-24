const { H } = cy;
import { USERS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  FIRST_COLLECTION_ID,
  ORDERS_MODEL_ID,
} from "e2e/support/cypress_sample_instance_data";
import type { StructuredQuestionDetails } from "e2e/support/helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

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

const LONG_NAME_METRIC: StructuredQuestionDetailsWithName = {
  ...ORDERS_SCALAR_METRIC,
  name: "A very long metric name that should be truncated by the metrics table because it does not fit within the name column",
  description:
    "This is a _very_ **long description** that should be truncated by the metrics table because it is really very long.",
};

describe("scenarios > browse > metrics", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
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

  describe("search, bookmarks and trash", () => {
    beforeEach(() => {
      H.resetSnowplow();
      cy.signInAsAdmin();
      H.enableTracking();
      cy.signInAsNormalUser();
    });

    afterEach(() => {
      H.expectNoBadSnowplowEvents();
    });

    it("should find a metric through search, and bookmark, trash, restore and permanently delete it", () => {
      createMetrics([ORDERS_SCALAR_METRIC, LONG_NAME_METRIC]);

      cy.log("command palette");
      cy.visit("/");
      H.commandPaletteSearch(ORDERS_SCALAR_METRIC.name, false);
      H.commandPalette()
        .findByRole("option", { name: ORDERS_SCALAR_METRIC.name })
        .click();
      H.MetricPage.aboutPage().should("be.visible");

      cy.log("search page");
      cy.intercept("GET", "/api/search?*context=search-app*").as("searchPage");
      cy.visit("/");
      H.commandPaletteSearch(ORDERS_SCALAR_METRIC.name, true);
      cy.wait("@searchPage");
      cy.findByTestId("search-app").findByTestId("type-search-filter").click();
      H.popover().within(() => {
        cy.findByText("Metric").click();
        cy.findByText("Apply").click();
      });
      cy.wait("@searchPage");
      cy.findByTestId("search-app").within(() => {
        cy.findByText("1 result").should("be.visible");
        cy.findByText(ORDERS_SCALAR_METRIC.name).click();
      });
      H.MetricPage.aboutPage().should("be.visible");

      cy.log("the metrics table truncates long names and descriptions");
      cy.visit("/");
      H.navigationSidebar().findByText("Metrics").click();
      cy.location("pathname").should("eq", "/browse/metrics");
      metricsTable()
        .findByText(LONG_NAME_METRIC.name)
        .should("be.visible")
        .then((el) => H.assertIsEllipsified(el[0]));
      metricsTable()
        .findByText(/This is a/)
        .should("be.visible")
        .then((el) => H.assertIsEllipsified(el[0]));

      cy.log("bookmark from the metrics page");
      openMetricMenu(ORDERS_SCALAR_METRIC.name);
      H.popover().findByText("Bookmark").click();
      shouldHaveBookmark(ORDERS_SCALAR_METRIC.name);
      H.expectUnstructuredSnowplowEvent({
        event: "bookmark_added",
        event_detail: "metric",
        triggered_from: "browse_metrics",
      });
      openMetricMenu(ORDERS_SCALAR_METRIC.name);
      H.popover().findByText("Remove from bookmarks").click();
      shouldNotHaveBookmark(ORDERS_SCALAR_METRIC.name);

      cy.log("bookmark from the collection page");
      cy.visit("/collection/root");
      H.openUnpinnedItemMenu(ORDERS_SCALAR_METRIC.name);
      H.popover().findByText("Bookmark").click();
      shouldHaveBookmark(ORDERS_SCALAR_METRIC.name);
      H.expectUnstructuredSnowplowEvent({
        event: "bookmark_added",
        event_detail: "metric",
        triggered_from: "collection_list",
      });
      cy.reload();
      shouldHaveBookmark(ORDERS_SCALAR_METRIC.name);
      H.openUnpinnedItemMenu(ORDERS_SCALAR_METRIC.name);
      H.popover().findByText("Remove from bookmarks").click();
      shouldNotHaveBookmark(ORDERS_SCALAR_METRIC.name);

      cy.log("trash from the metrics page and restore from the trash");
      H.navigationSidebar().findByText("Metrics").click();
      openMetricMenu(ORDERS_SCALAR_METRIC.name);
      H.popover().findByText("Move to trash").click();
      metricsTable().findByText(ORDERS_SCALAR_METRIC.name).should("not.exist");

      H.navigationSidebar().findByText("Trash").click();
      H.openUnpinnedItemMenu(ORDERS_SCALAR_METRIC.name);
      H.popover().findByText("Restore").click();
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      H.undoToastList()
        .last()
        .findByText(`${ORDERS_SCALAR_METRIC.name} has been restored.`)
        .should("be.visible");

      cy.visit("/browse/metrics");
      findMetric(ORDERS_SCALAR_METRIC.name).should("be.visible");

      cy.log("trash from the collection page, undo, and delete permanently");
      cy.visit("/collection/root");
      H.openUnpinnedItemMenu(ORDERS_SCALAR_METRIC.name);
      H.popover().findByText("Move to trash").click();
      H.undoToast().findByText("Trashed metric").should("be.visible");
      H.undo();
      H.getUnpinnedSection()
        .findByText(ORDERS_SCALAR_METRIC.name)
        .should("be.visible");
      H.openUnpinnedItemMenu(ORDERS_SCALAR_METRIC.name);
      H.popover().findByText("Move to trash").click();
      H.getUnpinnedSection()
        .findByText(ORDERS_SCALAR_METRIC.name)
        .should("not.exist");

      H.navigationSidebar().findByText("Trash").click();
      H.openUnpinnedItemMenu(ORDERS_SCALAR_METRIC.name);
      H.popover().findByText("Delete permanently").click();
      H.modal().button("Delete permanently").click();
      // eslint-disable-next-line metabase/no-unsafe-element-filtering
      H.undoToastList()
        .last()
        .findByText("This item has been permanently deleted.")
        .should("be.visible");

      cy.visit("/browse/metrics");
      findMetric(LONG_NAME_METRIC.name).should("be.visible");
      metricsTable().findByText(ORDERS_SCALAR_METRIC.name).should("not.exist");
      H.navigationSidebar().findByText("Trash").click();
      H.main().findByText("Nothing here").should("be.visible");
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

      verifiedMetricsSwitch().click();
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

      cy.log("removing the last verification hides the filter");
      unverifyMetric(ORDERS_SCALAR_METRIC);
      findMetric(ORDERS_SCALAR_METRIC.name).should("be.visible");
      findMetric(ORDERS_SCALAR_MODEL_METRIC.name).should("be.visible");
      cy.findByLabelText(/show.*verified.*metrics/i).should("not.exist");
    });
  });
});

function metricsTable() {
  return cy.findByLabelText("Table of metrics").should("be.visible");
}

function findMetric(name: string) {
  return metricsTable().findByText(name);
}

function openMetricMenu(name: string) {
  findMetric(name).closest("tr").findByLabelText("Metric options").click();
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

function createMetrics(metrics: StructuredQuestionDetailsWithName[]) {
  metrics.forEach((metric) => H.createQuestion(metric));
}
