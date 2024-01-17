import {
  restore,
  visitQuestionAdhoc,
  getDraggableElements,
} from "e2e/support/helpers";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const questionDetails = {
  name: "28304",
  dataset_query: {
    type: "query",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
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
    column_settings: {
      '["name","count"]': { show_mini_bar: true },
    },
  },
};

describe("issue 28304", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    visitQuestionAdhoc(questionDetails);
  });

  it("table should should generate default columns when table.columns entries do not match data.cols (metabase#28304)", () => {
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Count by Created At: Month").should("be.visible");

    cy.findByTestId("viz-settings-button").click();
    leftSidebar().should("not.contain", "[Unknown]");
    leftSidebar().should("contain", "Created At");
    leftSidebar().should("contain", "Count");
    cy.findAllByTestId("mini-bar").should("have.length.greaterThan", 0);
    getDraggableElements().should("have.length", 2);
  });
});

function leftSidebar() {
  return cy.findAllByTestId("sidebar-left");
}
