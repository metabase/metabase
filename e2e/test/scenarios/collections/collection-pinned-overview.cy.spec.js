import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  POPOVER_ELEMENT,
  changePinnedCardDescription,
  changePinnedDashboardDescription,
  dragAndDrop,
  getPinnedSection,
  openPinnedItemMenu,
  openRootCollection,
  openUnpinnedItemMenu,
  popover,
  restore,
} from "e2e/support/helpers";

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

const HEADING_1_TEXT = "Heading 1";
const HEADING_1_MARKDOWN = `# ${HEADING_1_TEXT}`;
const HEADING_2_TEXT = "Heading 2";
const HEADING_2_MARKDOWN = `## ${HEADING_2_TEXT}`;
const PARAGRAPH_TEXT = "Paragraph with link";
const PARAGRAPH_MARKDOWN = "Paragraph with [link](https://example.com)";
const MARKDOWN = [
  HEADING_1_MARKDOWN,
  HEADING_2_MARKDOWN,
  PARAGRAPH_MARKDOWN,
].join("\n");
const MARKDOWN_AS_TEXT = [HEADING_1_TEXT, HEADING_2_TEXT, PARAGRAPH_TEXT].join(
  "\n",
);
const HEADING_SHORT = "Short description";
const HEADING_SHORT_MARKDOWN = `# ${HEADING_SHORT}`;
const HEADING_LONG =
  "This is a very long description that will require visual truncation in the user interface";
const HEADING_LONG_MARKDOWN = `# ${HEADING_LONG}`;

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

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(`Move "${DASHBOARD_NAME}"?`).should("be.visible");
  });

  it("should be able to duplicate a pinned dashboard", () => {
    cy.request("PUT", "/api/dashboard/1", { collection_position: 1 });

    openRootCollection();
    openPinnedItemMenu(DASHBOARD_NAME);
    popover().findByText("Duplicate").click();

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
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
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
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

  it("should be able to pin a visualization by dragging it up", () => {
    cy.request("PUT", "/api/card/2", {
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
    dragAndDrop("draggingViz", "pinnedItems");

    cy.findByTestId("collection-table")
      .findByText("Orders, Count, Grouped by Created At (year)")
      .should("not.exist");

    cy.findByTestId("pinned-items")
      .findByText("Orders, Count, Grouped by Created At (year)")
      .should("exist");
  });

  describe("scenarios > collection pinned items overview > pinned model description tooltip", () => {
    beforeEach(() => {
      cy.request("PUT", "/api/card/1", { dataset: true });

      openRootCollection();
      openUnpinnedItemMenu(MODEL_NAME);
      popover().findByText("Pin this").click();
      cy.wait("@getPinnedItems");
    });

    it("should render only the first line of description without markdown formatting on pinned models", () => {
      changePinnedCardDescription(MODEL_NAME, MARKDOWN);
      openRootCollection();

      getPinnedSection().within(() => {
        cy.findByText(HEADING_1_TEXT).should("exist");

        cy.findByText(HEADING_1_MARKDOWN).should("not.exist");
        cy.findByText(HEADING_2_MARKDOWN).should("not.exist");
        cy.findByText(HEADING_2_TEXT).should("not.exist");
        cy.findByText(PARAGRAPH_MARKDOWN).should("not.exist");
        cy.findByText(PARAGRAPH_TEXT).should("not.exist");
      });
    });

    it("should render description tooltip with markdown formatting in pinned models", () => {
      changePinnedCardDescription(MODEL_NAME, MARKDOWN);
      openRootCollection();

      getPinnedSection().findByText(HEADING_1_TEXT).realHover();

      popover().within(() => {
        cy.findByText(MARKDOWN).should("not.exist");
        cy.findByText(HEADING_1_MARKDOWN).should("not.exist");
        cy.findByText(HEADING_2_MARKDOWN).should("not.exist");
        cy.findByText(PARAGRAPH_MARKDOWN).should("not.exist");
      });

      popover().invoke("text").should("eq", MARKDOWN_AS_TEXT);
    });

    it("should render description tooltip when ellipis was necessary", () => {
      changePinnedCardDescription(MODEL_NAME, HEADING_LONG_MARKDOWN);
      openRootCollection();

      getPinnedSection().findByText(HEADING_LONG).realHover();

      popover().within(() => {
        cy.findByText(HEADING_LONG_MARKDOWN).should("not.exist");
      });

      popover().invoke("text").should("eq", HEADING_LONG);
    });

    it("should not render description tooltip when ellipis is not necessary", () => {
      changePinnedCardDescription(MODEL_NAME, HEADING_SHORT_MARKDOWN);
      openRootCollection();

      getPinnedSection().findByText(HEADING_SHORT).realHover();

      cy.get(POPOVER_ELEMENT).should("not.exist");
    });
  });

  describe("scenarios > collection pinned items overview > pinned dashboard description tooltip", () => {
    beforeEach(() => {
      cy.request("PUT", "/api/card/1", { dataset: true });

      openRootCollection();
      openUnpinnedItemMenu(DASHBOARD_NAME);
      popover().findByText("Pin this").click();
      cy.wait("@getPinnedItems");
    });

    it("should render only the first line of description without markdown formatting", () => {
      changePinnedDashboardDescription(DASHBOARD_NAME, MARKDOWN);
      openRootCollection();

      getPinnedSection().within(() => {
        cy.findByText(HEADING_1_TEXT).should("exist");

        cy.findByText(HEADING_1_MARKDOWN).should("not.exist");
        cy.findByText(HEADING_2_MARKDOWN).should("not.exist");
        cy.findByText(HEADING_2_TEXT).should("not.exist");
        cy.findByText(PARAGRAPH_MARKDOWN).should("not.exist");
        cy.findByText(PARAGRAPH_TEXT).should("not.exist");
      });
    });

    it("should render description tooltip with markdown formatting", () => {
      changePinnedDashboardDescription(DASHBOARD_NAME, MARKDOWN);
      openRootCollection();

      getPinnedSection().findByText(HEADING_1_TEXT).realHover();

      popover().within(() => {
        cy.findByText(MARKDOWN).should("not.exist");
        cy.findByText(HEADING_1_MARKDOWN).should("not.exist");
        cy.findByText(HEADING_2_MARKDOWN).should("not.exist");
        cy.findByText(PARAGRAPH_MARKDOWN).should("not.exist");
      });

      popover().invoke("text").should("eq", MARKDOWN_AS_TEXT);
    });

    it("should render description tooltip when ellipis was necessary", () => {
      changePinnedDashboardDescription(DASHBOARD_NAME, HEADING_LONG_MARKDOWN);
      openRootCollection();

      getPinnedSection().findByText(HEADING_LONG).realHover();

      popover().within(() => {
        cy.findByText(HEADING_LONG_MARKDOWN).should("not.exist");
      });

      popover().invoke("text").should("eq", HEADING_LONG);
    });

    it("should not render description tooltip when ellipis is not necessary", () => {
      changePinnedDashboardDescription(DASHBOARD_NAME, HEADING_SHORT_MARKDOWN);
      openRootCollection();

      getPinnedSection().findByText(HEADING_SHORT).realHover();

      cy.get(POPOVER_ELEMENT).should("not.exist");
    });
  });

  describe("scenarios > collection pinned items overview > pinned native question description tooltip", () => {
    beforeEach(() => {
      cy.createNativeQuestion(SQL_QUESTION_DETAILS).then(({ body: { id } }) => {
        cy.request("PUT", `/api/card/${id}`, { collection_position: 1 });
      });

      openRootCollection();
    });

    it("should render only the first line of description without markdown formatting", () => {
      changePinnedCardDescription(SQL_QUESTION_DETAILS.name, MARKDOWN);
      openRootCollection();

      getPinnedSection().within(() => {
        cy.findByText(HEADING_1_TEXT).should("exist");

        cy.findByText(HEADING_1_MARKDOWN).should("not.exist");
        cy.findByText(HEADING_2_MARKDOWN).should("not.exist");
        cy.findByText(HEADING_2_TEXT).should("not.exist");
        cy.findByText(PARAGRAPH_MARKDOWN).should("not.exist");
        cy.findByText(PARAGRAPH_TEXT).should("not.exist");
      });
    });

    it("should render description tooltip with markdown formatting", () => {
      changePinnedCardDescription(SQL_QUESTION_DETAILS.name, MARKDOWN);
      openRootCollection();

      getPinnedSection().findByText(HEADING_1_TEXT).realHover();

      popover().within(() => {
        cy.findByText(MARKDOWN).should("not.exist");
        cy.findByText(HEADING_1_MARKDOWN).should("not.exist");
        cy.findByText(HEADING_2_MARKDOWN).should("not.exist");
        cy.findByText(PARAGRAPH_MARKDOWN).should("not.exist");
      });

      popover().invoke("text").should("eq", MARKDOWN_AS_TEXT);
    });

    it("should render description tooltip when ellipis was necessary", () => {
      changePinnedCardDescription(
        SQL_QUESTION_DETAILS.name,
        HEADING_LONG_MARKDOWN,
      );
      openRootCollection();

      getPinnedSection().findByText(HEADING_LONG).realHover();

      popover().within(() => {
        cy.findByText(HEADING_LONG_MARKDOWN).should("not.exist");
      });

      popover().invoke("text").should("eq", HEADING_LONG);
    });

    it("should not render description tooltip when ellipis is not necessary", () => {
      changePinnedCardDescription(
        SQL_QUESTION_DETAILS.name,
        HEADING_SHORT_MARKDOWN,
      );
      openRootCollection();

      getPinnedSection().findByText(HEADING_SHORT).realHover();

      cy.get(POPOVER_ELEMENT).should("not.exist");
    });
  });

  it("should render description tooltip with markdown formatting in a skeleton", () => {
    openRootCollection();
    openUnpinnedItemMenu(QUESTION_NAME);
    popover().findByText("Pin this").click();
    cy.wait(["@getPinnedItems", "@getCardQuery"]);
    changePinnedCardDescription(QUESTION_NAME, MARKDOWN);
    openRootCollection();

    // prevent replacing skeleton in DOM
    cy.intercept("POST", `/api/card/**/query`, { statusCode: 500, body: null });

    cy.findByTestId("skeleton-description-icon").realHover();

    popover().within(() => {
      cy.findByText(MARKDOWN).should("not.exist");
      cy.findByText(HEADING_1_MARKDOWN).should("not.exist");
      cy.findByText(HEADING_2_MARKDOWN).should("not.exist");
      cy.findByText(PARAGRAPH_MARKDOWN).should("not.exist");
    });

    popover().invoke("text").should("eq", MARKDOWN_AS_TEXT);
  });

  it("should render description tooltip with markdown formatting in question visualization", () => {
    openRootCollection();
    openUnpinnedItemMenu(QUESTION_NAME);
    popover().findByText("Pin this").click();
    cy.wait(["@getPinnedItems", "@getCardQuery"]);
    changePinnedCardDescription(QUESTION_NAME, MARKDOWN);
    openRootCollection();

    cy.findByTestId("legend-description-icon").realHover();

    popover().within(() => {
      cy.findByText(MARKDOWN).should("not.exist");
      cy.findByText(HEADING_1_MARKDOWN).should("not.exist");
      cy.findByText(HEADING_2_MARKDOWN).should("not.exist");
      cy.findByText(PARAGRAPH_MARKDOWN).should("not.exist");
    });

    popover().invoke("text").should("eq", MARKDOWN_AS_TEXT);
  });
});
