import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import {
  restore,
  popover,
  visitQuestion,
  cartesianChartCircle,
} from "e2e/support/helpers";

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

    cartesianChartCircle().eq(0).click();

    popover().findByText("See these Metrics").click();
    cy.wait("@dataset");

    cy.findByTestId("qb-filters-panel").within(() => {
      cy.findByText("Created At is Jan 1–31, 2024").should("be.visible");
    });
    // FIXME metrics v2 -- check that the values in column Total are above 150
  });
});

const createMetric = () => {
  return cy.createQuestion({
    name: "Metric",
    description: "Metric with a filter",
    type: "metric",
    query: {
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
      "source-table": `card__${metric_id}`,
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
      aggregation: [["metric", metric_id]],
    },
    visualization_settings: {
      "graph.dimensions": ["CREATED_AT"],
      "graph.metrics": ["count"],
    },
  });
};
