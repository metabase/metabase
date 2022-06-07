import {
  describeEE,
  restore,
  visitQuestionAdhoc,
} from "__support__/e2e/cypress";
import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const questionDetails = {
  display: "line",
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["cum-sum", ["field", ORDERS.TOTAL, null]]],
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
    },
  },
};

describeEE("visual tests > admin > colors", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should use custom brand colors", () => {
    cy.request("PUT", "/api/setting/application-colors", {
      value: {
        brand: "#885AB1",
        filter: "#F9CF48",
        summarize: "#ED6E6E",
      },
    });

    visitQuestionAdhoc(questionDetails);
    cy.percySnapshot("chart");

    cy.findByText("Filter").click();
    cy.percySnapshot("filters");

    cy.findByText("Summarize").click();
    cy.percySnapshot("summarize");
  });
});
