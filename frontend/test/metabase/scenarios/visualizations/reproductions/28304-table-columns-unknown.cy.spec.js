import {
  restore,
  visitQuestionAdhoc,
  leftSidebar,
  getDraggableElements,
} from "__support__/e2e/helpers";
import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const questionDetails = {
  name: "28304",
  dataset_query: {
    type: "query",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [
        ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
        ["field", ORDERS.USER_ID, null],
        ["field", ORDERS.PRODUCT_ID, null],
      ],
    },
    database: SAMPLE_DB_ID,
  },
  display: "table",
  visualization_settings: {
    "table.columns": [
      {
        fieldRef: ["field", ORDERS.ID, null],
        enabled: true,
      },
      {
        fieldRef: ["field", ORDERS.USER_ID, null],
        enabled: true,
      },
      {
        fieldRef: ["field", ORDERS.PRODUCT_ID, null],
        enabled: true,
      },
      {
        fieldRef: ["field", ORDERS.SUBTOTAL, null],
        enabled: true,
      },
      {
        fieldRef: ["field", ORDERS.TAX, null],
        enabled: true,
      },
      {
        fieldRef: ["field", ORDERS.DISCOUNT, null],
        enabled: true,
      },
    ],
  },
};

describe("issue 25250", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    visitQuestionAdhoc(questionDetails);
  });

  it("pivot table should show standalone values when collapsed to the sub-level grouping (metabase#25250)", () => {
    cy.findByText("Count by 3 breakouts").should("be.visible");

    cy.findByTestId("viz-settings-button").click();
    leftSidebar().should("not.contain", "[Unknown]");
    getDraggableElements().should("have.length", 2);
  });
});
