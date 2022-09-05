import { restore, visitQuestionAdhoc } from "__support__/e2e/helpers";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  name: "13960",
  display: "line",
  dataset_query: {
    type: "query",
    database: 1,
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"], ["avg", ["field", ORDERS.TOTAL, null]]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
    },
  },
  visualization_settings: {
    "graph.dimensions": ["CREATED_AT"],
    "graph.metrics": ["avg"],
  },
};

describe("issue 11249", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should not allow adding more series when all columns are used (metabase#11249)", () => {
    visitQuestionAdhoc(questionDetails);

    cy.findByText("Settings").click();

    cy.findByTestId("sidebar-left").within(() => {
      cy.findByText("Data").click();
      cy.findByText("Count").should("not.exist");

      cy.findByText("Add another series...").click();
      cy.findByText("Count").should("be.visible");
      cy.findByText("Add another series...").should("not.exist");
    });
  });
});
