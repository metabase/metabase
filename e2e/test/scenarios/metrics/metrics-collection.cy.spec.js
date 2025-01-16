import { USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  FIRST_COLLECTION_ID,
  ORDERS_MODEL_ID,
} from "e2e/support/cypress_sample_instance_data";

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

const ORDERS_SCALAR_MODEL_METRIC = {
  name: "Orders model metric",
  type: "metric",
  query: {
    "source-table": `card__${ORDERS_MODEL_ID}`,
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
    cy.restore();
    cy.signInAsNormalUser();
  });

  it("should show metrics in collections", () => {
    cy.createQuestion(ORDERS_SCALAR_METRIC);
    cy.createQuestion(ORDERS_TIMESERIES_METRIC);
    cy.visit("/collection/root");
    cy.getPinnedSection().within(() => {
      cy.findByText("Metrics").should("be.visible");
      cy.findByText(ORDERS_SCALAR_METRIC.name).should("be.visible");
      cy.findByTestId("scalar-container")
        .findByText("18,760")
        .should("be.visible");
      cy.findByText(ORDERS_TIMESERIES_METRIC.name).should("be.visible");
      cy.echartsContainer().should("be.visible");
    });
  });

  it("should be possible to pin and unpin metrics", () => {
    cy.createQuestion(ORDERS_SCALAR_METRIC);
    cy.visit("/collection/root");
    cy.getPinnedSection()
      .findByText(ORDERS_SCALAR_METRIC.name)
      .should("be.visible");
    cy.getUnpinnedSection()
      .findByText(ORDERS_SCALAR_METRIC.name)
      .should("not.exist");
    cy.openPinnedItemMenu(ORDERS_SCALAR_METRIC.name);
    cy.popover().findByText("Unpin").click();
    cy.getPinnedSection().should("not.exist");
    cy.getUnpinnedSection()
      .findByText(ORDERS_SCALAR_METRIC.name)
      .should("be.visible");
    cy.openUnpinnedItemMenu(ORDERS_SCALAR_METRIC.name);
    cy.popover().findByText("Pin this").click();
    cy.getPinnedSection()
      .findByText(ORDERS_SCALAR_METRIC.name)
      .should("be.visible");
    cy.getUnpinnedSection()
      .findByText(ORDERS_SCALAR_METRIC.name)
      .should("not.exist");
  });

  it("should be possible to add and remove a metric from bookmarks", () => {
    cy.createQuestion(ORDERS_SCALAR_METRIC);
    cy.createQuestion({
      ...ORDERS_TIMESERIES_METRIC,
      collection_position: null,
    });
    cy.visit("/collection/root");

    cy.openPinnedItemMenu(ORDERS_SCALAR_METRIC.name);
    cy.popover().findByText("Bookmark").click();
    cy.navigationSidebar()
      .findByText(ORDERS_SCALAR_METRIC.name)
      .should("be.visible");
    cy.openPinnedItemMenu(ORDERS_SCALAR_METRIC.name);
    cy.popover().findByText("Remove from bookmarks").click();
    cy.navigationSidebar()
      .findByText(ORDERS_SCALAR_METRIC.name)
      .should("not.exist");

    cy.openUnpinnedItemMenu(ORDERS_TIMESERIES_METRIC.name);
    cy.popover().findByText("Bookmark").click();
    cy.navigationSidebar()
      .findByText(ORDERS_TIMESERIES_METRIC.name)
      .should("be.visible");
    cy.openUnpinnedItemMenu(ORDERS_TIMESERIES_METRIC.name);
    cy.popover().findByText("Remove from bookmarks").click();
    cy.navigationSidebar()
      .findByText(ORDERS_TIMESERIES_METRIC.name)
      .should("not.exist");
  });

  it("should be possible to hide the visualization for a pinned metric", () => {
    cy.createQuestion(ORDERS_SCALAR_METRIC);
    cy.visit("/collection/root");
    cy.getPinnedSection().within(() => {
      cy.findByText(ORDERS_SCALAR_METRIC.name).should("be.visible");
      cy.findByTestId("scalar-container").should("be.visible");
    });

    cy.openPinnedItemMenu(ORDERS_SCALAR_METRIC.name);
    cy.popover().findByText("Don’t show visualization").click();
    cy.getPinnedSection().within(() => {
      cy.findByText(ORDERS_SCALAR_METRIC.name).should("be.visible");
      cy.findByTestId("scalar-container").should("not.exist");
    });

    cy.openPinnedItemMenu(ORDERS_SCALAR_METRIC.name);
    cy.popover().findByText("Show visualization").click();
    cy.getPinnedSection().within(() => {
      cy.findByText(ORDERS_SCALAR_METRIC.name).should("be.visible");
      cy.findByTestId("scalar-container").should("be.visible");
    });
  });

  it("should be possible to archive, unarchive, and delete a metric", () => {
    cy.createQuestion(ORDERS_SCALAR_METRIC);
    cy.createQuestion({
      ...ORDERS_TIMESERIES_METRIC,
      collection_position: null,
    });
    cy.visit("/collection/root");

    cy.openPinnedItemMenu(ORDERS_SCALAR_METRIC.name);
    cy.popover().findByText("Move to trash").click();
    cy.getPinnedSection().should("not.exist");
    cy.undoToast().findByText("Trashed metric").should("be.visible");
    cy.undo();
    cy.getPinnedSection()
      .findByText(ORDERS_SCALAR_METRIC.name)
      .should("be.visible");

    cy.openUnpinnedItemMenu(ORDERS_TIMESERIES_METRIC.name);
    cy.popover().findByText("Move to trash").click();
    cy.getUnpinnedSection()
      .findByText(ORDERS_TIMESERIES_METRIC.name)
      .should("not.exist");
    cy.undoToastList().last().findByText("Trashed metric").should("be.visible");

    openArchive();
    cy.openUnpinnedItemMenu(ORDERS_TIMESERIES_METRIC.name);
    cy.popover().findByText("Restore").click();
    cy.getUnpinnedSection()
      .findByText(ORDERS_TIMESERIES_METRIC.name)
      .should("not.exist");
    cy.undoToastList()
      .last()
      .findByText(`${ORDERS_TIMESERIES_METRIC.name} has been restored.`)
      .should("be.visible");

    cy.navigationSidebar().findByText("Our analytics").click();
    cy.openUnpinnedItemMenu(ORDERS_TIMESERIES_METRIC.name);
    cy.popover().findByText("Move to trash").click();
    openArchive();
    cy.openUnpinnedItemMenu(ORDERS_TIMESERIES_METRIC.name);
    cy.popover().findByText("Delete permanently").click();
    cy.modal().button("Delete permanently").click();
    cy.getUnpinnedSection().should("not.exist");
    cy.undoToastList()
      .last()
      .findByText("This item has been permanently deleted.")
      .should("be.visible");
  });

  it("should be able to view a model-based metric without collection access to the source model", () => {
    cy.signInAsAdmin();
    cy.updateCollectionGraph({
      [USER_GROUPS.ALL_USERS_GROUP]: {
        root: "none",
        [FIRST_COLLECTION_ID]: "read",
      },
    });
    cy.createQuestion({
      ...ORDERS_SCALAR_MODEL_METRIC,
      collection_id: FIRST_COLLECTION_ID,
    }).then(({ body: card }) => {
      cy.signIn("nocollection");
      cy.visitCollection(FIRST_COLLECTION_ID);
    });
    cy.getPinnedSection()
      .findByTestId("scalar-container")
      .findByText("18,760")
      .should("be.visible");
  });
});

function openArchive() {
  cy.navigationSidebar().findByText("Trash").click();
}
