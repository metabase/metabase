import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  createQuestion,
  echartsContainer,
  getPinnedSection,
  getUnpinnedSection,
  navigationSidebar,
  openPinnedItemMenu,
  openUnpinnedItemMenu,
  popover,
  restore,
  undo,
  undoToast,
  undoToastList,
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

  it("should be possible to archive, unarchive, and delete a metric", () => {
    createQuestion(ORDERS_SCALAR_METRIC);
    createQuestion({ ...ORDERS_TIMESERIES_METRIC, collection_position: null });
    cy.visit("/collection/root");

    openPinnedItemMenu(ORDERS_SCALAR_METRIC.name);
    popover().findByText("Archive").click();
    getPinnedSection().should("not.exist");
    undoToast().findByText("Archived metric").should("be.visible");
    undo();
    getPinnedSection()
      .findByText(ORDERS_SCALAR_METRIC.name)
      .should("be.visible");

    openUnpinnedItemMenu(ORDERS_TIMESERIES_METRIC.name);
    popover().findByText("Archive").click();
    getUnpinnedSection()
      .findByText(ORDERS_TIMESERIES_METRIC.name)
      .should("not.exist");
    undoToastList().findByText("Archived metric").should("be.visible");

    openArchive();
    unarchiveArchivedItem(ORDERS_TIMESERIES_METRIC.name);
    getArchivedList()
      .findByText(ORDERS_TIMESERIES_METRIC.name)
      .should("not.exist");
    undoToastList().findByText("Unarchived metric").should("be.visible");

    navigationSidebar().findByText("Our analytics").click();
    openUnpinnedItemMenu(ORDERS_TIMESERIES_METRIC.name);
    popover().findByText("Archive").click();
    openArchive();
    deleteArchivedItem(ORDERS_TIMESERIES_METRIC.name);
    getArchivedList()
      .findByText(ORDERS_TIMESERIES_METRIC.name)
      .should("not.exist");
  });
});

function openArchive() {
  navigationSidebar().icon("ellipsis").click();
  popover().findByText("View archive").click();
}

function getArchivedList() {
  return cy.findByTestId("archived-list");
}

function unarchiveArchivedItem(name) {
  getArchivedList()
    .findByTestId(`archive-item-${name}`)
    .realHover()
    .icon("unarchive")
    .click();
}

function deleteArchivedItem(name) {
  getArchivedList()
    .findByTestId(`archive-item-${name}`)
    .realHover()
    .icon("trash")
    .click();
}
