import { restore, visitQuestionAdhoc } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS, ORDERS_ID } = SAMPLE_DATASET;

const Y_AXIS_RIGHT_SELECTOR = ".axis.yr";

const testQuery = {
  type: "query",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [["datetime-field", ["field-id", ORDERS.CREATED_AT], "month"]],
  },
  database: 1,
};

describe("scenarios > visualizations > line chart", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.server();
  });

  it("should be able to change y axis position (metabase#13487)", () => {
    cy.route("POST", "/api/dataset").as("dataset");

    visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "line",
    });

    cy.wait("@dataset");
    cy.findByText("Settings").click();
    cy.findByText("Right").click();
    cy.get(Y_AXIS_RIGHT_SELECTOR);
  });

  it.skip("should be able to format data point values style independently on multi-series chart (metabase#13095)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        type: "query",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            ["sum", ["field", ORDERS.TOTAL, null]],
            [
              "aggregation-options",
              ["/", ["avg", ["field", ORDERS.QUANTITY, null]], 10],
              { "display-name": "AvgPct" },
            ],
          ],
          breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
        },
        database: 1,
      },
      display: "line",
      visualization_settings: {
        "graph.show_values": true,
        column_settings: {
          '["name","expression"]': { number_style: "percent" },
        },
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["sum", "expression"],
      },
    });

    cy.get(".value-labels").contains("30%");
  });
});
