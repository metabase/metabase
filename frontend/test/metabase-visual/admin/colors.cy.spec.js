import {
  describeEE,
  restore,
  visitQuestionAdhoc,
} from "__support__/e2e/helpers";
import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS, ORDERS_ID, PEOPLE } = SAMPLE_DATABASE;

const questionDetails = {
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-table": ORDERS_ID,
      aggregation: [["count"]],
      breakout: [
        ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
        ["field", PEOPLE.STATE, { "source-field": ORDERS.USER_ID }],
      ],
    },
  },
  display: "bar",
  visualization_settings: {
    "graph.dimensions": ["CREATED_AT", "STATE"],
    "graph.metrics": ["count"],
    "stackable.stack_type": "stacked",
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

    cy.icon("notebook").click();
    cy.percySnapshot("filters");
    cy.icon("notebook").click();

    cy.findByText("Summarize").click();
    cy.percySnapshot("summarize");
  });

  it("should use custom chart colors", () => {
    cy.request("PUT", "/api/setting/application-colors", {
      value: {
        accent0: "#885AB1",
        accent1: "#F9CF48",
        accent2: "#ED6E6E",
      },
    });

    visitQuestionAdhoc(questionDetails);
    cy.percySnapshot("chart");

    cy.icon("notebook").click();
    cy.percySnapshot("filters");
    cy.icon("notebook").click();

    cy.findByText("Summarize").click();
    cy.percySnapshot("summarize");
  });
});
