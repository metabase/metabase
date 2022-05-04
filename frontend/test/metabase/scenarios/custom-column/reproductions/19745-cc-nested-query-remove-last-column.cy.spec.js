import { restore, visitQuestionAdhoc } from "__support__/e2e/cypress";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  display: "table",
  query: {
    "source-query": {
      "source-table": PRODUCTS_ID,
      aggregation: [
        ["count"],
        ["sum", ["field", PRODUCTS.PRICE, null]],
        ["sum", ["field", PRODUCTS.RATING, null]],
      ],
      breakout: [["field", PRODUCTS.CATEGORY, null]],
    },
    fields: [
      ["field", PRODUCTS.CATEGORY, null],
      ["field", "sum", { "base-type": "type/Float" }],
      ["field", "sum_2", { "base-type": "type/Float" }],
      ["expression", "Custom Column"],
    ],
    expressions: {
      "Custom Column": ["+", 1, 1],
    },
  },
};

describe("issue 19745", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should unwrap the inner query when removing all non-field clauses (metabase#19745)", () => {
    visitQuestionAdhoc(questionDetails);
  });
});
