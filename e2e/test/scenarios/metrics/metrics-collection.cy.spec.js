import { USER_GROUPS } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  FIRST_COLLECTION_ID,
  ORDERS_MODEL_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  createQuestion,
  echartsContainer,
  getPinnedSection,
  getUnpinnedSection,
  modal,
  navigationSidebar,
  openPinnedItemMenu,
  openUnpinnedItemMenu,
  popover,
  restore,
  undo,
  undoToast,
  undoToastList,
  visitCollection,
} from "e2e/support/helpers";

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
    restore();
    cy.signInAsNormalUser();
  });

  it("should show metrics in collections", () => {
    createQuestion(ORDERS_SCALAR_METRIC);
    createQuestion(ORDERS_TIMESERIES_METRIC);
    cy.visit("/collection/root");
    getPinnedSection().within(() => {
      cy.findByText("Metrics").should("be.visible");
      cy.findByText(ORDERS_SCALAR_METRIC.name).should("be.visible");
      cy.findByTestId("scalar-container")
        .findByText("18,760")
        .should("be.visible");
      cy.findByText(ORDERS_TIMESERIES_METRIC.name).should("be.visible");
      echartsContainer().should("be.visible");
    });
  });

  it("should be possible to pin and unpin metrics", () => {
    createQuestion(ORDERS_SCALAR_METRIC);
    cy.visit("/collection/root");
    getPinnedSection()
      .findByText(ORDERS_SCALAR_METRIC.name)
      .should("be.visible");
    getUnpinnedSection()
      .findByText(ORDERS_SCALAR_METRIC.name)
      .should("not.exist");
    openPinnedItemMenu(ORDERS_SCALAR_METRIC.name);
    popover().findByText("Unpin").click();
    getPinnedSection().should("not.exist");
    getUnpinnedSection()
      .findByText(ORDERS_SCALAR_METRIC.name)
      .should("be.visible");
    openUnpinnedItemMenu(ORDERS_SCALAR_METRIC.name);
    popover().findByText("Pin this").click();
    getPinnedSection()
      .findByText(ORDERS_SCALAR_METRIC.name)
      .should("be.visible");
    getUnpinnedSection()
      .findByText(ORDERS_SCALAR_METRIC.name)
      .should("not.exist");
  });

  it("should be possible to add and remove a metric from bookmarks", () => {
    createQuestion(ORDERS_SCALAR_METRIC);
    createQuestion({ ...ORDERS_TIMESERIES_METRIC, collection_position: null });
    cy.visit("/collection/root");

    openPinnedItemMenu(ORDERS_SCALAR_METRIC.name);
    popover().findByText("Bookmark").click();
    navigationSidebar()
      .findByText(ORDERS_SCALAR_METRIC.name)
      .should("be.visible");
    openPinnedItemMenu(ORDERS_SCALAR_METRIC.name);
    popover().findByText("Remove from bookmarks").click();
    navigationSidebar()
      .findByText(ORDERS_SCALAR_METRIC.name)
      .should("not.exist");

    openUnpinnedItemMenu(ORDERS_TIMESERIES_METRIC.name);
    popover().findByText("Bookmark").click();
    navigationSidebar()
      .findByText(ORDERS_TIMESERIES_METRIC.name)
      .should("be.visible");
    openUnpinnedItemMenu(ORDERS_TIMESERIES_METRIC.name);
    popover().findByText("Remove from bookmarks").click();
    navigationSidebar()
      .findByText(ORDERS_TIMESERIES_METRIC.name)
      .should("not.exist");
  });

  it("should be possible to hide the visualization for a pinned metric", () => {
    createQuestion(ORDERS_SCALAR_METRIC);
    cy.visit("/collection/root");
    getPinnedSection().within(() => {
      cy.findByText(ORDERS_SCALAR_METRIC.name).should("be.visible");
      cy.findByTestId("scalar-container").should("be.visible");
    });

    openPinnedItemMenu(ORDERS_SCALAR_METRIC.name);
    popover().findByText("Don’t show visualization").click();
    getPinnedSection().within(() => {
      cy.findByText(ORDERS_SCALAR_METRIC.name).should("be.visible");
      cy.findByTestId("scalar-container").should("not.exist");
    });

    openPinnedItemMenu(ORDERS_SCALAR_METRIC.name);
    popover().findByText("Show visualization").click();
    getPinnedSection().within(() => {
      cy.findByText(ORDERS_SCALAR_METRIC.name).should("be.visible");
      cy.findByTestId("scalar-container").should("be.visible");
    });
  });

  it("should be possible to archive, unarchive, and delete a metric", () => {
    createQuestion(ORDERS_SCALAR_METRIC);
    createQuestion({ ...ORDERS_TIMESERIES_METRIC, collection_position: null });
    cy.visit("/collection/root");

    openPinnedItemMenu(ORDERS_SCALAR_METRIC.name);
    popover().findByText("Move to trash").click();
    getPinnedSection().should("not.exist");
    undoToast().findByText("Trashed metric").should("be.visible");
    undo();
    getPinnedSection()
      .findByText(ORDERS_SCALAR_METRIC.name)
      .should("be.visible");

    openUnpinnedItemMenu(ORDERS_TIMESERIES_METRIC.name);
    popover().findByText("Move to trash").click();
    getUnpinnedSection()
      .findByText(ORDERS_TIMESERIES_METRIC.name)
      .should("not.exist");
    undoToastList().last().findByText("Trashed metric").should("be.visible");

    openArchive();
    openUnpinnedItemMenu(ORDERS_TIMESERIES_METRIC.name);
    popover().findByText("Restore").click();
    getUnpinnedSection()
      .findByText(ORDERS_TIMESERIES_METRIC.name)
      .should("not.exist");
    undoToastList()
      .last()
      .findByText(`${ORDERS_TIMESERIES_METRIC.name} has been restored.`)
      .should("be.visible");

    navigationSidebar().findByText("Our analytics").click();
    openUnpinnedItemMenu(ORDERS_TIMESERIES_METRIC.name);
    popover().findByText("Move to trash").click();
    openArchive();
    openUnpinnedItemMenu(ORDERS_TIMESERIES_METRIC.name);
    popover().findByText("Delete permanently").click();
    modal().button("Delete permanently").click();
    getUnpinnedSection().should("not.exist");
    undoToastList()
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
    createQuestion({
      ...ORDERS_SCALAR_MODEL_METRIC,
      collection_id: FIRST_COLLECTION_ID,
    }).then(({ body: card }) => {
      cy.signIn("nocollection");
      visitCollection(FIRST_COLLECTION_ID);
    });
    getPinnedSection()
      .findByTestId("scalar-container")
      .findByText("18,760")
      .should("be.visible");
  });
});

function openArchive() {
  navigationSidebar().findByText("Trash").click();
}
