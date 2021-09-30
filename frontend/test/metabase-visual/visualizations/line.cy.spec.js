import { restore, visitQuestionAdhoc } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS, ORDERS_ID, PEOPLE } = SAMPLE_DATASET;

describe("visual tests > visualizations > line", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.server();
    cy.route("POST", "/api/dataset").as("dataset");
  });

  it("with data points", () => {
    visitQuestionAdhoc({
      dataset_query: {
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
      },
      display: "line",
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["count"],
        "graph.show_values": true,
      },
    });

    cy.wait("@dataset");

    cy.percySnapshot();
  });

  it("with vertical legends", () => {
    visitQuestionAdhoc({
      dataset_query: {
        database: 1,
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            [
              "field",
              ORDERS.CREATED_AT,
              {
                "temporal-unit": "month",
              },
            ],
            [
              "field",
              PEOPLE.STATE,
              {
                "source-field": 11,
              },
            ],
          ],
        },
      },
      display: "line",
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT", "STATE"],
        "graph.metrics": ["count"],
      },
    });

    cy.wait("@dataset");

    cy.percySnapshot();
  });

  it("with vertical legends", () => {
    visitQuestionAdhoc({
      dataset_query: {
        database: 1,
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"]],
          breakout: [
            [
              "field",
              ORDERS.CREATED_AT,
              {
                "temporal-unit": "month",
              },
            ],
            [
              "field",
              PEOPLE.STATE,
              {
                "source-field": 11,
              },
            ],
          ],
        },
      },
      display: "line",
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT", "STATE"],
        "graph.metrics": ["count"],
      },
    });

    cy.wait("@dataset");

    cy.percySnapshot();
  });
});
