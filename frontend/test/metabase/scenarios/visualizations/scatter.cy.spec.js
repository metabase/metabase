import { restore, visitQuestionAdhoc, popover } from "__support__/cypress";
import { SAMPLE_DATASET } from "__support__/cypress_sample_dataset";

const { ORDERS, ORDERS_ID } = SAMPLE_DATASET;

const testQuery = {
  database: 1,
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"], ["distinct", ["field-id", ORDERS.PRODUCT_ID]]],
    breakout: [["datetime-field", ["field-id", ORDERS.CREATED_AT], "month"]],
  },
  type: "query",
};

describe("scenarios > visualizations > scatter", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.server();
    cy.route("POST", "/api/dataset").as("dataset");
  });

  it("should show correct labels in tooltip (metabase#15150)", () => {
    visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "scatter",
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["count", "count_2"],
      },
    });

    cy.wait("@dataset");

    cy.get(".bubble")
      .last()
      .trigger("mousemove");

    popover().within(() => {
      cy.findByText("Created At:");
      cy.findByText("Count:");
      cy.findByText("Distinct values of Product ID:");
    });
  });

  it("should show correct labels in tooltip when display name has manually set (metabase#11395)", () => {
    visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "scatter",
      visualization_settings: {
        "graph.dimensions": ["CREATED_AT"],
        "graph.metrics": ["count", "count_2"],
        series_settings: {
          count: {
            title: "Orders count",
          },
          count_2: {
            title: "Products count",
          },
        },
      },
    });

    cy.wait("@dataset");

    cy.get(".bubble")
      .last()
      .trigger("mousemove");

    popover().within(() => {
      cy.findByText("Created At:");
      cy.findByText("Orders count:");
      cy.findByText("Products count:");
    });
  });
});
