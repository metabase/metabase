import { restore, visitQuestionAdhoc } from "__support__/e2e/cypress";

import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS, ORDERS_ID, PRODUCTS } = SAMPLE_DATABASE;

const testQuery = {
  database: SAMPLE_DB_ID,
  query: {
    "source-table": ORDERS_ID,
    aggregation: [
      ["count"],
      [
        "distinct",
        ["field", PRODUCTS.ID, { "source-field": ORDERS.PRODUCT_ID }],
      ],
    ],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
  },
  type: "query",
};

describe("visual tests > visualizations > scatter", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("with date dimension", () => {
    visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "scatter",
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["count", "count_2"],
      },
    });

    cy.percySnapshot();
  });
});
