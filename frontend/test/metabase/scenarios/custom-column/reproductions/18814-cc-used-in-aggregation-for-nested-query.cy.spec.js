import { restore, popover, visualize } from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const ccName = "Custom Created At";

const questionDetails = {
  name: "18814",
  query: {
    "source-query": {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }]],
    },
    expressions: {
      [ccName]: ["field", "CREATED_AT", { "base-type": "type/DateTime" }],
    },
  },
};

describe("issue 18814", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.createQuestion(questionDetails, { visitQuestion: true });
  });

  it("should be able to use a custom column in aggregation for a nested query (metabase#18814)", () => {
    cy.icon("notebook").click();

    cy.icon("sum").click();
    cy.findByText("Count of rows").click();

    cy.findByText("Pick a column to group by").click();
    popover().contains(ccName).click();

    visualize();

    cy.get(".Visualization").should("contain", "2016");
  });
});
