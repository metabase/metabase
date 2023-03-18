import { restore, visitQuestionAdhoc } from "e2e/support/helpers";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const questionDetails = {
  name: "25250",
  dataset_query: {
    type: "query",
    query: {
      "source-table": ORDERS_ID,
      filter: ["<", ["field", ORDERS.CREATED_AT, null], "2016-06-01"],
      aggregation: [["count"]],
      breakout: [
        ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
        ["field", ORDERS.USER_ID, null],
        ["field", ORDERS.PRODUCT_ID, null],
      ],
    },
    database: SAMPLE_DB_ID,
  },
  display: "pivot",
  visualization_settings: {
    "pivot_table.column_split": {
      rows: [
        ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
        ["field", ORDERS.USER_ID, null],
        ["field", ORDERS.PRODUCT_ID, null],
      ],
      columns: [],
      values: [["aggregation", 0]],
    },
    "pivot_table.collapsed_rows": {
      value: [],
      rows: [
        ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
        ["field", ORDERS.USER_ID, null],
        ["field", ORDERS.PRODUCT_ID, null],
      ],
    },
  },
};

describe.skip("issue 25250", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    visitQuestionAdhoc(questionDetails);
  });

  it("pivot table should show standalone values when collapsed to the sub-level grouping (metabase#25250)", () => {
    cy.findByText("1162").should("be.visible");
    // Collapse "User ID" column
    cy.findByText("User ID").parent().find(".Icon-dash").click();
    cy.findByText("1162").should("be.visible");
  });
});
