const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_DASHBOARD_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";

const { ORDERS, ORDERS_ID, PEOPLE } = SAMPLE_DATABASE;

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
      rows: ["CREATED_AT"],
      columns: [],
      values: ["count"],
    },
  },
};

const SQL_QUESTION_DETAILS_REQUIRED_PARAMETER = {
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

const SQL_QUESTION_DETAILS_WITH_DEFAULT_VALUE = {
  name: "SQL with parameters",
  display: "scalar",
  native: {
    "template-tags": {
      filter: {
        type: "dimension",
        name: "filter",
        id: "4b77cc1f-ea70-4ef6-84db-58432fce6928",
        "display-name": "date",
        default: "1999-02-26~2024-02-26",
        dimension: ["field", PEOPLE.BIRTH_DATE, null],
        "widget-type": "date/range",
      },
    },
    query: "select count(*) from people where {{filter}}",
  },
};

describe("scenarios > collection pinned items overview", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();

    cy.intercept("POST", "/api/card/**/query").as("getCardQuery");
    cy.intercept("GET", "/api/**/items?pinned_state*").as("getPinnedItems");
  });

  it("should be able to pin a dashboard", () => {
    openRootCollection();
    H.openUnpinnedItemMenu(DASHBOARD_NAME);
    H.popover().findByText("Pin this").click();
    cy.wait("@getPinnedItems");

    H.getPinnedSection().within(() => {
      cy.icon("dashboard").should("be.visible");
      cy.findByText("A dashboard").should("be.visible");
      cy.findByText(DASHBOARD_NAME).click();
      cy.url().should("include", `/dashboard/${ORDERS_DASHBOARD_ID}`);
    });
  });

  it("should be able to pin a question", () => {
    openRootCollection();
    H.openUnpinnedItemMenu(QUESTION_NAME);
    H.popover().findByText("Pin this").click();
    cy.wait(["@getPinnedItems", "@getCardQuery"]);

    H.getPinnedSection().within(() => {
      cy.findByText("18,760").should("be.visible");
      cy.findByText(QUESTION_NAME).click();
      cy.url().should("include", `/question/${ORDERS_COUNT_QUESTION_ID}`);
    });
  });

  it("should be able to pin a pivot table", () => {
    H.createQuestion(PIVOT_QUESTION_DETAILS).then(({ body: { id } }) => {
      cy.request("PUT", `/api/card/${id}`, { collection_position: 1 });
    });

    openRootCollection();
    cy.wait("@getCardQuery");

    H.getPinnedSection().within(() => {
      cy.findByText(PIVOT_QUESTION_DETAILS.name).should("be.visible");
      cy.findByText("Created At: Month").should("be.visible");
      cy.findByText("Count").should("be.visible");
    });
  });

  it("should be able to pin a model", () => {
    cy.request("PUT", `/api/card/${ORDERS_QUESTION_ID}`, { type: "model" });

    openRootCollection();
    H.openUnpinnedItemMenu(MODEL_NAME);
    H.popover().findByText("Pin this").click();
    cy.wait("@getPinnedItems");

    H.getPinnedSection().within(() => {
      cy.icon("model").should("be.visible");
      cy.findByText(MODEL_NAME).should("be.visible");
      cy.findByText("A model").click();
      cy.url().should("include", `/model/${ORDERS_QUESTION_ID}`);
    });
  });

  it("should be able to unpin a pinned dashboard", () => {
    cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      collection_position: 1,
    });

    openRootCollection();
    H.openPinnedItemMenu(DASHBOARD_NAME);
    H.popover().findByText("Unpin").click();
    cy.wait("@getPinnedItems");

    H.getPinnedSection().should("not.exist");
  });

  it("should be able to move a pinned dashboard", () => {
    cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      collection_position: 1,
    });

    openRootCollection();
    H.openPinnedItemMenu(DASHBOARD_NAME);
    H.popover().findByText("Move").click();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(`Move "${DASHBOARD_NAME}"?`).should("be.visible");
  });

  it("should be able to duplicate a pinned dashboard", () => {
    cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      collection_position: 1,
    });

    openRootCollection();
    H.openPinnedItemMenu(DASHBOARD_NAME);
    H.popover().findByText("Duplicate").click();

    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(`Duplicate "${DASHBOARD_NAME}" and its questions`).should(
      "be.visible",
    );
  });

  it("should be able to archive a pinned dashboard", () => {
    cy.request("PUT", `/api/dashboard/${ORDERS_DASHBOARD_ID}`, {
      collection_position: 1,
    });

    openRootCollection();
    H.openPinnedItemMenu(DASHBOARD_NAME);
    H.popover().findByText("Move to trash").click();
    cy.wait("@getPinnedItems");

    H.getPinnedSection().should("not.exist");
    // eslint-disable-next-line metabase/no-unscoped-text-selectors -- deprecated usage
    cy.findByText(DASHBOARD_NAME).should("not.exist");
  });

  it("should be able to hide the visualization for a pinned question", () => {
    cy.request("PUT", `/api/card/${ORDERS_COUNT_QUESTION_ID}`, {
      collection_position: 1,
    });

    openRootCollection();
    cy.log("wait for data to be loaded and displayed");
    H.getPinnedSection().should("contain", "18,760");
    H.openPinnedItemMenu(QUESTION_NAME);
    H.popover().findByText("Don’t show visualization").click();
    cy.wait("@getPinnedItems");

    H.getPinnedSection().within(() => {
      cy.findByText("18,760").should("not.exist");
      cy.findByText("A question").should("be.visible");
      cy.findByText(QUESTION_NAME).click();
      cy.url().should("include", `/question/${ORDERS_COUNT_QUESTION_ID}`);
    });
  });

  it("should be able to show the visualization for a pinned question", () => {
    cy.request("PUT", `/api/card/${ORDERS_COUNT_QUESTION_ID}`, {
      collection_position: 1,
      collection_preview: false,
    });

    openRootCollection();
    H.openPinnedItemMenu(QUESTION_NAME);
    H.popover().findByText("Show visualization").click();
    cy.wait(["@getPinnedItems", "@getCardQuery"]);

    H.getPinnedSection().within(() => {
      cy.findByText(QUESTION_NAME).should("be.visible");
      cy.findByText("18,760").should("be.visible");
    });
  });

  describe("native questions", () => {
    it("should automatically hide the visualization for pinned native questions with missing required parameters", () => {
      H.createNativeQuestion(SQL_QUESTION_DETAILS_REQUIRED_PARAMETER).then(
        ({ body: { id } }) => {
          cy.request("PUT", `/api/card/${id}`, { collection_position: 1 });
        },
      );

      openRootCollection();
      H.getPinnedSection().within(() => {
        cy.findByText(SQL_QUESTION_DETAILS_WITH_DEFAULT_VALUE.name).should(
          "be.visible",
        );
        cy.findByText("A question").should("be.visible");
      });
    });

    it("should apply default value of variable for pinned native questions (metabase#37831)", () => {
      H.createNativeQuestion(SQL_QUESTION_DETAILS_WITH_DEFAULT_VALUE).then(
        ({ body: { id } }) => {
          cy.request("PUT", `/api/card/${id}`, { collection_position: 1 });
        },
      );

      openRootCollection();
      H.getPinnedSection().within(() => {
        cy.findByText(SQL_QUESTION_DETAILS_WITH_DEFAULT_VALUE.name).should(
          "be.visible",
        );
        cy.findByTestId("scalar-value").should("have.text", "68");
      });
    });
  });

  it("should be able to pin a visualization by dragging it up", () => {
    cy.request("PUT", `/api/card/${ORDERS_COUNT_QUESTION_ID}`, {
      collection_position: 1,
      collection_preview: false,
    });
    openRootCollection();

    cy.findByTestId("collection-table")
      .findByText("Orders, Count, Grouped by Created At (year)")
      .as("draggingViz");

    cy.findByTestId("pinned-items").as("pinnedItems");

    // this test can give us some degree of confidence, but its effectiveness is limited
    // because we are manually firing events on the correct elements. It doesn't seem that there's
    // a way to actually simulate the raw user interaction of dragging a certain distance in cypress.
    // this will not guarantee that the drag and drop functionality will work in the real world, e.g
    // when our various drag + drop libraries start interfering with events on one another.
    // for example, this test would not have caught https://github.com/metabase/metabase/issues/30614
    // even libraries like https://github.com/dmtrKovalenko/cypress-real-events rely on firing events
    // on specific elements rather than truly simulating mouse movements across the screen
    H.dragAndDrop("draggingViz", "pinnedItems");

    cy.findByTestId("collection-table")
      .findByText("Orders, Count, Grouped by Created At (year)")
      .should("not.exist");

    cy.findByTestId("pinned-items")
      .findByText("Orders, Count, Grouped by Created At (year)")
      .should("exist");
  });
});

const openRootCollection = () => {
  cy.visit("/collection/root");
  cy.wait("@getPinnedItems");
};
