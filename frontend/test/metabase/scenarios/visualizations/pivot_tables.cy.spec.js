import { signInAsAdmin, restore } from "__support__/cypress";
import { SAMPLE_DATASET } from "__support__/cypress_sample_dataset";

const { ORDERS, ORDERS_ID, PRODUCTS, PEOPLE } = SAMPLE_DATASET;

const QUESTION_NAME = "Cypress Pivot Table";

describe("scenarios > visualizations > pivot tables", () => {
  beforeEach(() => {
    restore();
    signInAsAdmin();
  });

  it("should be created from an ad-hoc question", () => {
    // We're intentionally setting the visualization to `bar` here
    createAndVisitTestQuestion({ display: "bar" });

    // By changing the visualization type, we make this an "ad-hoc" question
    cy.findByText("Visualization").click();
    cy.get(".Icon-pivot_table")
      .should("be.visible")
      .click();

    cy.findByText(/Count by Users? → Source and Products? → Category/); // ad-hoc title

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
});

function createAndVisitTestQuestion({ display = "pivot" } = {}) {
  cy.request("POST", "/api/card", {
    name: QUESTION_NAME,
    dataset_query: {
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
    },
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

  cy.findByText("Fields to use for the table rows");
  cy.get("@fieldOption")
    .eq(0)
    .contains(/Users? → Source/);
  cy.findByText("Fields to use for the table columns");
  cy.get("@fieldOption")
    .eq(1)
    .contains(/Products? → Category/);
  cy.findByText("Fields to use for the table values");
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
