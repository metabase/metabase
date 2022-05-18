import { restore, visitQuestionAdhoc } from "__support__/e2e/cypress";
import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const questionWithFilter = {
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-table": ORDERS_ID,
      filter: ["=", ["field", ORDERS.USER_ID, null], 1],
    },
  },
};

const questionWithBreakout = {
  dataset_query: {
    database: SAMPLE_DB_ID,
    type: "query",
    query: {
      "source-table": ORDERS_ID,
      breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
      aggregation: [["count"]],
    },
  },
};

describe("scenarios > filters > bulk filtering", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should set filters for a raw query", () => {
    visitQuestionAdhoc(questionWithFilter);

    cy.findByLabelText("Show more filters").click();
    cy.findByLabelText("User ID").within(() => cy.icon("close").click());
    cy.findByLabelText("Quantity").click();
    cy.findByPlaceholderText("Search the list").type("20");
    cy.findByText("20").click();
    cy.button("Add filter").click();
    cy.button("Apply").click();
    cy.wait("@dataset");

    cy.findByText("User ID is 1").should("not.exist");
    cy.findByText("Quantity is equal to 20").should("be.visible");
    cy.findByText("Showing 4 rows").should("be.visible");
  });

  it("should set filters for an aggregated query", () => {
    visitQuestionAdhoc(questionWithBreakout);

    cy.findByLabelText("Show more filters").click();
    cy.findByLabelText("Count").click();
    cy.findByText("Equal to").click();
    cy.findByText("Greater than").click();
    cy.findByPlaceholderText("Enter a number").type("500");
    cy.button("Add filter").click();
    cy.button("Apply").click();
    cy.wait("@dataset");

    cy.findByText("Count is greater than 500").should("be.visible");
    cy.findByText("Showing 21 rows").should("be.visible");
  });
});
