import {
  signInAsAdmin,
  restore,
  visitQuestionAdhoc,
} from "__support__/cypress";
import { SAMPLE_DATASET } from "__support__/cypress_sample_dataset";

const { ORDERS, ORDERS_ID, PRODUCTS, PEOPLE } = SAMPLE_DATASET;

const QUESTION_NAME = "Cypress Pivot Table";

describe("scenarios > visualizations > pivot tables", () => {
  beforeEach(() => {
    restore();
    signInAsAdmin();
  });

  it("should be created from an ad-hoc question", () => {
    visitQuestionAdhoc({ dataset_query: testQuery, display: "pivot" });

    cy.findByText(/Count by Users? → Source and Products? → Category/); // ad-hoc title

    cy.findByText("Settings").click();
    assertOnPivotSettings();
    assertOnPivotTable();
  });

  it("should correctly display saved question", () => {
    createAndVisitTestQuestion();

    assertOnPivotTable();

    // Open Pivot table side-bar
    cy.findByText("Settings").click();

    assertOnPivotSettings();
  });

  it("should not show sub-total data after a switch to other viz type", () => {
    createAndVisitTestQuestion();

    // Switch to "ordinary" table
    cy.findByText("Visualization").click();
    cy.get(".Icon-table")
      .should("be.visible")
      .click();

    cy.contains(`Started from ${QUESTION_NAME}`);

    cy.log("**-- Assertions on a table itself --**");
    cy.get(".Visualization").within(() => {
      cy.findByText(/Users? → Source/);
      cy.findByText("783"); // Affiliate - Doohickey
      cy.findByText("986"); // Twitter - Gizmo
      cy.findByText(/Row totals/i).should("not.exist");
      cy.findByText(/Grand totals/i).should("not.exist");
      cy.findByText("3,520").should("not.exist");
      cy.findByText("4,784").should("not.exist");
      cy.findByText("18,760").should("not.exist");
    });
  });

  it("should rearrange pivoted columns", () => {
    createAndVisitTestQuestion();

    // Open Pivot table side-bar
    cy.findByText("Settings").click();

    // Give it some time to open the side-bar fully before we start dragging
    cy.findByText(/Pivot Table options/i);

    // Drag the second aggregate (Product category) from table columns to table rows
    dragField(1, 0);

    // One field should now be empty
    cy.findByText("Drag fields here");

    cy.log("**-- Implicit assertions on a table itself --**");
    cy.get(".Visualization").within(() => {
      cy.findByText(/Products? → Category/);
      cy.findByText(/Users? → Source/);
      cy.findByText("Count");
      cy.findByText(/Totals for Doohickey/i);
      cy.findByText("3,976");
    });
  });

  it("should be able to use binned numeric dimension as a grouping (metabase#14136)", () => {
    // Sample dataset Orders > Count by Subtotal: Auto binned
    visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            ["binning-strategy", ["field-id", ORDERS.SUBTOTAL], "default"],
          ],
        },
        database: 1,
      },
      display: "pivot",
      visualization_settings: {},
    });

    cy.get(".Visualization").within(() => {
      cy.findByText("Subtotal");
      cy.findByText("Count");
      cy.findByText("2,720");
      cy.findByText(/Grand totals/i);
      cy.findByText("18,760");
    });
  });

  it("should allow collapsing rows", () => {
    // open a pivot table of order count grouped by source, category x year
    const b1 = ["datetime-field", ["field-id", ORDERS.CREATED_AT], "year"];
    const b2 = [
      "fk->",
      ["field-id", ORDERS.PRODUCT_ID],
      ["field-id", PRODUCTS.CATEGORY],
    ];
    const b3 = [
      "fk->",
      ["field-id", ORDERS.USER_ID],
      ["field-id", PEOPLE.SOURCE],
    ];

    visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [b1, b2, b3],
        },
        database: 1,
      },
      display: "pivot",
      visualization_settings: {
        "pivot_table.column_split": {
          rows: [b2, b3],
          columns: [b1],
          values: [["aggregation", 0]],
        },
      },
    });

    cy.findByText("215"); // see a non-subtotal value

    // click to collapse rows
    cy.findByText("Doohickey")
      .parent()
      .find(".Icon-dash")
      .click();
    cy.findByText("1,352"); // subtotal is still there
    cy.findByText("215").should("not.exist"); // value is hidden

    // click to uncollapse
    cy.findByText("Totals for Doohickey")
      .parent()
      .find(".Icon-add")
      .click();
    cy.findByText("215"); // ...and it's back!
  });

  it("should display an error message for native queries", () => {
    cy.server();
    // native queries should use the normal dataset endpoint even when set to pivot
    cy.route("POST", `/api/dataset`).as("dataset");

    visitQuestionAdhoc({
      dataset_query: {
        type: "native",
        native: { query: "select 1", "template-tags": {} },
        database: 1,
      },
      display: "pivot",
      visualization_settings: {},
    });

    cy.wait("@dataset");
    cy.findByText("Pivot tables can only be used with aggregated queries.");
  });
});

const testQuery = {
  type: "query",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      ["fk->", ["field-id", ORDERS.USER_ID], ["field-id", PEOPLE.SOURCE]],
      [
        "fk->",
        ["field-id", ORDERS.PRODUCT_ID],
        ["field-id", PRODUCTS.CATEGORY],
      ],
    ],
  },
  database: 1,
};

function createAndVisitTestQuestion({ display = "pivot" } = {}) {
  cy.request("POST", "/api/card", {
    name: QUESTION_NAME,
    dataset_query: testQuery,
    display,
    description: null,
    visualization_settings: {},
  }).then(({ body: { id: QUESTION_ID } }) => {
    cy.visit(`/question/${QUESTION_ID}`);
  });
}

function assertOnPivotSettings() {
  cy.get("[draggable=true]").as("fieldOption");

  cy.log("**-- Implicit side-bar assertions --**");
  cy.findByText(/Pivot Table options/i);

  cy.findAllByText("Fields to use for the table").eq(0);
  cy.get("@fieldOption")
    .eq(0)
    .contains(/Users? → Source/);
  cy.findAllByText("Fields to use for the table").eq(1);
  cy.get("@fieldOption")
    .eq(1)
    .contains(/Products? → Category/);
  cy.findAllByText("Fields to use for the table").eq(2);
  cy.get("@fieldOption")
    .eq(2)
    .contains("Count");
}

function assertOnPivotTable() {
  cy.log("**-- Implicit assertions on a table itself --**");
  cy.get(".Visualization").within(() => {
    cy.findByText(/Users? → Source/);
    cy.findByText(/Row totals/i);
    cy.findByText(/Grand totals/i);
    cy.findByText("3,520");
    cy.findByText("4,784");
    cy.findByText("18,760");
  });
}

// Rely on native drag events, rather than on the coordinates
// We have 3 "drag-handles" in this test. Their indexes are 0-based.
function dragField(startIndex, dropIndex) {
  cy.get(".Grabber")
    .should("be.visible")
    .as("dragHandle");

  cy.get("@dragHandle")
    .eq(startIndex)
    .trigger("dragstart");

  cy.get("@dragHandle")
    .eq(dropIndex)
    .trigger("drop");
}
