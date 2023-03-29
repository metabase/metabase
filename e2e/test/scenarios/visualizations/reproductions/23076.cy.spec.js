import { restore } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS, PEOPLE } = SAMPLE_DATABASE;

const questionDetails = {
  name: "Orders, Distinct values of ID, Grouped by Product → Title and Created At (month) and User → ID",

  query: {
    "source-table": ORDERS_ID,
    aggregation: [["distinct", ["field", ORDERS.ID, null]]],
    breakout: [
      ["field", PRODUCTS.TITLE, { "source-field": ORDERS.PRODUCT_ID }],
      ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
      ["field", PEOPLE.ID, { "source-field": ORDERS.USER_ID }],
    ],
  },
  display: "pivot",
  visualization_settings: {
    "pivot_table.column_split": {
      rows: [
        ["field", PRODUCTS.TITLE, { "source-field": ORDERS.PRODUCT_ID }],
        ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
        ["field", PEOPLE.ID, { "source-field": ORDERS.USER_ID }],
      ],
      columns: [],
      values: [["aggregation", 0]],
    },
  },
};

describe("issue 23076", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.request("PUT", "/api/user/1", {
      locale: "de",
    });

    cy.createQuestion(questionDetails, { visitQuestion: true });
  });

  it("should correctly translate dates (metabase#23076)", () => {
    cy.findAllByText(/^Summen für/)
      .should("be.visible")
      .eq(1)
      .invoke("text")
      .should("eq", "Summen für Mai, 2017");
  });
});
