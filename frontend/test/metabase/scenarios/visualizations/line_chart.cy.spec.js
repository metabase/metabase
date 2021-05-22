import { restore, visitQuestionAdhoc, popover } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS, ORDERS_ID, PRODUCTS } = SAMPLE_DATASET;

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

  it.skip("should correctly display tooltip values when X-axis is numeric and style is 'Ordinal' (metabase#15998)", () => {
    visitQuestionAdhoc({
      dataset_query: {
        database: 1,
        query: {
          "source-table": ORDERS_ID,
          aggregation: [
            ["count"],
            ["sum", ["field", ORDERS.TOTAL, null]],
            ["avg", ["field", ORDERS.QUANTITY, null]],
          ],
          breakout: [
            ["field", PRODUCTS.RATING, { "source-field": ORDERS.PRODUCT_ID }],
          ],
        },
        type: "query",
      },
      display: "line",
      visualization_settings: {
        "graph.x_axis.scale": "ordinal",
        "graph.dimensions": ["RATING"],
        "graph.metrics": ["count", "sum", "avg"],
      },
    });
    cy.get(".Visualization .enable-dots")
      .last()
      .find(".dot")
      .eq(3)
      .trigger("mousemove", { force: true });
    popover().within(() => {
      testPairedTooltipValues("Product → Rating", "2.7");
      testPairedTooltipValues("Count", "191");
      testPairedTooltipValues("Sum of Total", "14,747.05");
      testPairedTooltipValues("Average of Quantity", "4");
    });
  });
});

function testPairedTooltipValues(val1, val2) {
  cy.contains(val1)
    .closest("td")
    .siblings("td")
    .findByText(val2);
}
