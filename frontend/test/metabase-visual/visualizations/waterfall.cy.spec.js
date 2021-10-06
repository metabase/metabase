import { restore, visitQuestionAdhoc } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS, ORDERS_ID } = SAMPLE_DATASET;

const testQuery = {
  type: "query",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      [
        "field",
        ORDERS.CREATED_AT,
        {
          "temporal-unit": "year",
        },
      ],
    ],
  },
  database: 1,
};

describe("visual tests > visualizations > waterfall", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.server();
    cy.route("POST", "/api/dataset").as("dataset");
  });

  it("with positive and negative series", () => {
    visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "waterfall",
      visualization_settings: {
        "graph.show_values": true,
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["count"],
      },
    });

    cy.wait("@dataset");

    cy.percySnapshot();
  });
});
