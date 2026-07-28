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
  collection_position: 1,
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
  collection_position: 1,
};

describe("scenarios > metrics > collection", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsNormalUser();
  });

  it("should show metrics in collections", () => {
    H.createQuestion(ORDERS_SCALAR_METRIC);
    H.createQuestion(ORDERS_TIMESERIES_METRIC);
    cy.visit("/collection/root");
    H.getPinnedSection().within(() => {
      cy.findByText("Metrics").should("be.visible");
      cy.findByText(ORDERS_SCALAR_METRIC.name).should("be.visible");
      cy.findByTestId("scalar-container")
        .findByText("18,760")
        .should("be.visible");
      cy.findByText(ORDERS_TIMESERIES_METRIC.name).should("be.visible");
      H.echartsContainer().should("be.visible");
    });
  });

  it("should be possible to pin and unpin metrics", () => {
    H.createQuestion(ORDERS_SCALAR_METRIC);
    cy.visit("/collection/root");
    H.getPinnedSection()
      .findByText(ORDERS_SCALAR_METRIC.name)
      .should("be.visible");
    H.getUnpinnedSection()
      .findByText(ORDERS_SCALAR_METRIC.name)
      .should("not.exist");
    H.openPinnedItemMenu(ORDERS_SCALAR_METRIC.name);
    H.popover().findByText("Unpin").click();
    H.getPinnedSection().should("not.exist");
    H.getUnpinnedSection()
      .findByText(ORDERS_SCALAR_METRIC.name)
      .should("be.visible");
    H.openUnpinnedItemMenu(ORDERS_SCALAR_METRIC.name);
    H.popover().findByText("Pin this").click();
    H.getPinnedSection()
      .findByText(ORDERS_SCALAR_METRIC.name)
      .should("be.visible");
    H.getUnpinnedSection()
      .findByText(ORDERS_SCALAR_METRIC.name)
      .should("not.exist");
  });

  it("should be possible to add and remove a metric from bookmarks", () => {
    H.createQuestion(ORDERS_SCALAR_METRIC);
    H.createQuestion({
      ...ORDERS_TIMESERIES_METRIC,
      collection_position: null,
    });
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");

    cy.visit("/collection/root");

    cy.wait("@cardQuery");
    H.getPinnedSection().should("contain", "18,760");
    H.openPinnedItemMenu(ORDERS_SCALAR_METRIC.name);

    H.popover().findByText("Bookmark").click();
    H.navigationSidebar()
      .findByText(ORDERS_SCALAR_METRIC.name)
      .should("be.visible");

    cy.log("pinned card should 'blink' to load and later show the data");
    cy.wait("@cardQuery");
    H.getPinnedSection().should("contain", "18,760");

    H.openPinnedItemMenu(ORDERS_SCALAR_METRIC.name);
    H.popover().findByText("Remove from bookmarks").click();
    H.navigationSidebar()
      .findByText(ORDERS_SCALAR_METRIC.name)
      .should("not.exist");

    H.openUnpinnedItemMenu(ORDERS_TIMESERIES_METRIC.name);
    H.popover().findByText("Bookmark").click();
    H.navigationSidebar()
      .findByText(ORDERS_TIMESERIES_METRIC.name)
      .should("be.visible");
    H.openUnpinnedItemMenu(ORDERS_TIMESERIES_METRIC.name);
    H.popover().findByText("Remove from bookmarks").click();
    H.navigationSidebar()
      .findByText(ORDERS_TIMESERIES_METRIC.name)
      .should("not.exist");
  });

  it("should be possible to hide the visualization for a pinned metric", () => {
    H.createQuestion(ORDERS_SCALAR_METRIC);
    cy.visit("/collection/root");
    H.getPinnedSection().within(() => {
      cy.findByText(ORDERS_SCALAR_METRIC.name).should("be.visible");
      cy.findByTestId("scalar-container").should("be.visible");
    });

    H.openPinnedItemMenu(ORDERS_SCALAR_METRIC.name);
    H.popover().findByText("Don’t show visualization").click();
    H.getPinnedSection().within(() => {
      cy.findByText(ORDERS_SCALAR_METRIC.name).should("be.visible");
      cy.findByTestId("scalar-container").should("not.exist");
    });

    H.openPinnedItemMenu(ORDERS_SCALAR_METRIC.name);
    H.popover().findByText("Show visualization").click();
    H.getPinnedSection().within(() => {
      cy.findByText(ORDERS_SCALAR_METRIC.name).should("be.visible");
      cy.findByTestId("scalar-container").should("be.visible");
    });
  });

  it("should be possible to archive, unarchive, and delete a metric", () => {
    H.createQuestion(ORDERS_SCALAR_METRIC);
    H.createQuestion({
      ...ORDERS_TIMESERIES_METRIC,
      collection_position: null,
    });
    cy.visit("/collection/root");

    H.openPinnedItemMenu(ORDERS_SCALAR_METRIC.name);
    H.popover().findByText("Move to trash").click();
    H.getPinnedSection().should("not.exist");
    H.undoToast().findByText("Trashed metric").should("be.visible");
    H.undo();
    H.getPinnedSection()
      .findByText(ORDERS_SCALAR_METRIC.name)
      .should("be.visible");

    H.openUnpinnedItemMenu(ORDERS_TIMESERIES_METRIC.name);
    H.popover().findByText("Move to trash").click();
    H.getUnpinnedSection()
      .findByText(ORDERS_TIMESERIES_METRIC.name)
      .should("not.exist");
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.undoToastList().last().findByText("Trashed metric").should("be.visible");

    openArchive();
    H.openUnpinnedItemMenu(ORDERS_TIMESERIES_METRIC.name);
    H.popover().findByText("Restore").click();
    H.getUnpinnedSection()
      .findByText(ORDERS_TIMESERIES_METRIC.name)
      .should("not.exist");
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.undoToastList()
      .last()
      .findByText(`${ORDERS_TIMESERIES_METRIC.name} has been restored.`)
      .should("be.visible");

    H.navigationSidebar().findByText("Our analytics").click();
    H.openUnpinnedItemMenu(ORDERS_TIMESERIES_METRIC.name);
    H.popover().findByText("Move to trash").click();
    openArchive();
    H.openUnpinnedItemMenu(ORDERS_TIMESERIES_METRIC.name);
    H.popover().findByText("Delete permanently").click();
    H.modal().button("Delete permanently").click();
    H.getUnpinnedSection().should("not.exist");
    // eslint-disable-next-line metabase/no-unsafe-element-filtering
    H.undoToastList()
      .last()
      .findByText("This item has been permanently deleted.")
      .should("be.visible");
  });
});

function openArchive() {
  H.navigationSidebar().findByText("Trash").click();
}
