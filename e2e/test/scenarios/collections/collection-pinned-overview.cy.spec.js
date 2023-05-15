import {
  popover,
  restore,
  getPinnedSection,
  openPinnedItemMenu,
  openUnpinnedItemMenu,
} from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const DASHBOARD_NAME = "Orders in a dashboard";
const QUESTION_NAME = "Orders, Count";
const MODEL_NAME = "Orders";

const PIVOT_QUESTION_DETAILS = {
  name: "Pivot table",
  display: "pivot",
  query: {
    "source-table": ORDERS_ID,
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
    aggregation: [["count"]],
  },
  visualization_settings: {
    "table.pivot_column": "CREATED_AT",
    "table.cell_column": "count",
    "pivot_table.column_split": {
      rows: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
      columns: [],
      values: [["aggregation", 0]],
    },
  },
};

const SQL_QUESTION_DETAILS = {
  name: "SQL with parameters",
  display: "scalar",
  native: {
    "template-tags": {
      filter: {
        id: "ce8f111c-24c4-6823-b34f-f704404572f1",
        name: "filter",
        "display-name": "Filter",
        type: "text",
        required: true,
      },
    },
    query: "select {{filter}}",
  },
};

describe("scenarios > collection pinned items overview", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.intercept("POST", `/api/card/**/query`).as("getCardQuery");
    cy.intercept("GET", "/api/**/items?pinned_state*").as("getPinnedItems");
  });

  it("should be able to pin a dashboard", () => {
    openRootCollection();
    openUnpinnedItemMenu(DASHBOARD_NAME);
    popover().findByText("Pin this").click();
    cy.wait("@getPinnedItems");

    getPinnedSection().within(() => {
      cy.icon("dashboard").should("be.visible");
      cy.findByText("A dashboard").should("be.visible");
      cy.findByText(DASHBOARD_NAME).click();
      cy.url().should("include", "/dashboard/1");
    });
  });

  it("should be able to pin a question", () => {
    openRootCollection();
    openUnpinnedItemMenu(QUESTION_NAME);
    popover().findByText("Pin this").click();
    cy.wait(["@getPinnedItems", "@getCardQuery"]);

    getPinnedSection().within(() => {
      cy.findByText("18,760").should("be.visible");
      cy.findByText(QUESTION_NAME).click();
      cy.url().should("include", "/question/2");
    });
  });

  it("should be able to pin a pivot table", () => {
    cy.createQuestion(PIVOT_QUESTION_DETAILS).then(({ body: { id } }) => {
      cy.request("PUT", `/api/card/${id}`, { collection_position: 1 });
    });

    openRootCollection();
    cy.wait("@getCardQuery");

    getPinnedSection().within(() => {
      cy.findByText(PIVOT_QUESTION_DETAILS.name).should("be.visible");
      cy.findByText("Created At: Month").should("be.visible");
      cy.findByText("Count").should("be.visible");
    });
  });

  it("should be able to pin a model", () => {
    cy.request("PUT", "/api/card/1", { dataset: true });

    openRootCollection();
    openUnpinnedItemMenu(MODEL_NAME);
    popover().findByText("Pin this").click();
    cy.wait("@getPinnedItems");

    getPinnedSection().within(() => {
      cy.icon("model").should("be.visible");
      cy.findByText(MODEL_NAME).should("be.visible");
      cy.findByText("A model").click();
      cy.url().should("include", "/model/1");
    });
  });

  it("should be able to unpin a pinned dashboard", () => {
    cy.request("PUT", "/api/dashboard/1", { collection_position: 1 });

    openRootCollection();
    openPinnedItemMenu(DASHBOARD_NAME);
    popover().findByText("Unpin").click();
    cy.wait("@getPinnedItems");

    getPinnedSection().should("not.exist");
  });

  it("should be able to move a pinned dashboard", () => {
    cy.request("PUT", "/api/dashboard/1", { collection_position: 1 });

    openRootCollection();
    openPinnedItemMenu(DASHBOARD_NAME);
    popover().findByText("Move").click();

    cy.findByText(`Move "${DASHBOARD_NAME}"?`).should("be.visible");
  });

  it("should be able to duplicate a pinned dashboard", () => {
    cy.request("PUT", "/api/dashboard/1", { collection_position: 1 });

    openRootCollection();
    openPinnedItemMenu(DASHBOARD_NAME);
    popover().findByText("Duplicate").click();

    cy.findByText(`Duplicate "${DASHBOARD_NAME}" and its questions`).should(
      "be.visible",
    );
  });

  it("should be able to archive a pinned dashboard", () => {
    cy.request("PUT", "/api/dashboard/1", { collection_position: 1 });

    openRootCollection();
    openPinnedItemMenu(DASHBOARD_NAME);
    popover().findByText("Archive").click();
    cy.wait("@getPinnedItems");

    getPinnedSection().should("not.exist");
    cy.findByText(DASHBOARD_NAME).should("not.exist");
  });

  it("should be able to hide the visualization for a pinned question", () => {
    cy.request("PUT", "/api/card/2", { collection_position: 1 });

    openRootCollection();
    openPinnedItemMenu(QUESTION_NAME);
    popover().findByText("Don’t show visualization").click();
    cy.wait("@getPinnedItems");

    getPinnedSection().within(() => {
      cy.findByText("18,760").should("not.exist");
      cy.findByText("A question").should("be.visible");
      cy.findByText(QUESTION_NAME).click();
      cy.url().should("include", "/question/2");
    });
  });

  it("should be able to show the visualization for a pinned question", () => {
    cy.request("PUT", "/api/card/2", {
      collection_position: 1,
      collection_preview: false,
    });

    openRootCollection();
    openPinnedItemMenu(QUESTION_NAME);
    popover().findByText("Show visualization").click();
    cy.wait(["@getPinnedItems", "@getCardQuery"]);

    getPinnedSection().within(() => {
      cy.findByText(QUESTION_NAME).should("be.visible");
      cy.findByText("18,760").should("be.visible");
    });
  });

  it("should automatically hide the visualization for pinned native questions with missing required parameters", () => {
    cy.createNativeQuestion(SQL_QUESTION_DETAILS).then(({ body: { id } }) => {
      cy.request("PUT", `/api/card/${id}`, { collection_position: 1 });
    });

    openRootCollection();
    getPinnedSection().within(() => {
      cy.findByText(SQL_QUESTION_DETAILS.name).should("be.visible");
      cy.findByText("A question").should("be.visible");
    });
  });
});

const openRootCollection = () => {
  cy.visit("/collection/root");
  cy.wait("@getPinnedItems");
};
