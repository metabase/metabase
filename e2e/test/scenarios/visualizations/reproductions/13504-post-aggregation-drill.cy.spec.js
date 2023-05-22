import { restore } from "e2e/support/helpers";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  name: "13504",
  display: "line",
  query: {
    "source-query": {
      "source-table": ORDERS_ID,
      filter: [">", ["field", ORDERS.TOTAL, null], 50],
      aggregation: [["count"]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
    },
    filter: [">", ["field", "count", { "base-type": "type/Integer" }], 100],
  },
  visualization_settings: {
    "graph.dimensions": ["CREATED_AT"],
    "graph.metrics": ["count"],
  },
};

describe("issue 13504", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("should remove post-aggregation filters from a multi-stage query (metabase#13504)", () => {
    cy.createQuestion(questionDetails, { visitQuestion: true });

    cy.get(".dot").eq(0).click({ force: true });
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText(/See these Orders/).click();
    cy.wait("@dataset");

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Total is greater than 50").should("be.visible");
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("Created At is March, 2017").should("be.visible");
  });
});
