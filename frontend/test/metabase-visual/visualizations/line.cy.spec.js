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

  it("with multiple series and different display types (metabase#11216)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["count"], ["sum", ["field", ORDERS.TOTAL, null]]],
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
        series_settings: {
          sum: {
            display: "line",
          },
          count: {
            display: "area",
          },
        },
        "graph.dimensions": ["CREATED_AT"],
        "graph.x_axis.scale": "ordinal",
        "graph.show_values": true,
        "graph.metrics": ["count", "sum"],
      },
    });

    cy.wait("@dataset");

    cy.percySnapshot();
  });

  it("with missing values and duplicate x (metabase#11076)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        type: "native",
        native: {
          query: `
            SELECT CAST('2010-10-01' AS DATE) as d, null as v1, 1 as v2
            UNION ALL
            SELECT CAST('2010-10-01' AS DATE), 2, null
            UNION ALL
            SELECT CAST('2010-10-02' AS DATE), 3, null
            UNION ALL
            SELECT CAST('2010-10-02' AS DATE), null, 4
            UNION ALL
            SELECT CAST('2010-10-03' AS DATE), null, 5
            UNION ALL
            SELECT CAST('2010-10-03' AS DATE), 6, null
          `,
        },
        database: 1,
      },
      display: "line",
      visualization_settings: {
        "graph.dimensions": ["D"],
        "graph.show_values": true,
        "graph.metrics": ["V1", "V2"],
        series_settings: {
          V1: {
            "line.missing": "zero",
          },
          V2: {
            "line.missing": "none",
          },
        },
      },
    });

    cy.wait("@dataset");

    cy.percySnapshot();
  });
});
