import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  visitQuestionAdhoc,
  getDraggableElements,
  moveDnDKitElement,
} from "e2e/support/helpers";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const questionDetails = {
  name: "28311",
  dataset_query: {
    type: "query",
    query: {
      "source-table": ORDERS_ID,
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
        enabled: false,
      },
      {
        fieldRef: ["field", ORDERS.TAX, null],
        enabled: false,
      },
      {
        fieldRef: ["field", ORDERS.DISCOUNT, null],
        enabled: false,
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
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Product ID").should("be.visible");

    cy.findByTestId("viz-settings-button").click();
    moveDnDKitElement(getDraggableElements().contains("Product ID"), {
      vertical: -100,
    });
    getDraggableElements().eq(0).should("contain", "Product ID");
  });
});
