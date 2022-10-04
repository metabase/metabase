import { restore, visitQuestion } from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("issue 6010", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should apply the filter from a metric when drilling through (metabase#6010)", () => {
    createMetric()
      .then(({ body: { id } }) => createQuestion(id))
      .then(({ body: { id } }) => visitQuestion(id));

    cy.get(".dot").eq(0).click({ force: true });
    cy.findByText(/View these Orders/).click();
    cy.wait("@dataset");

    cy.findByText("Created At is January, 2018").should("be.visible");
    cy.findByText("Total is greater than 150").should("be.visible");
  });
});

const createMetric = () => {
  return cy.request("POST", "/api/metric", {
    name: "Metric",
    description: "Metric with a filter",
    table_id: ORDERS_ID,
    definition: {
      "source-table": ORDERS_ID,
      filter: [">", ORDERS.TOTAL, 150],
      aggregation: [["count"]],
    },
  });
};

const createQuestion = metric_id => {
  return cy.createQuestion({
    name: "Question",
    display: "line",
    query: {
      "source-table": ORDERS_ID,
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
      aggregation: [["metric", metric_id]],
    },
    visualization_settings: {
      "graph.dimensions": ["CREATED_AT"],
      "graph.metrics": ["count"],
    },
  });
};
