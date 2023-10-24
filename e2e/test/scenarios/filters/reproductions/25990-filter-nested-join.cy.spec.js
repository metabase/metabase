import {
  restore,
  visitQuestionAdhoc,
  queryBuilderHeader,
} from "e2e/support/helpers";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

const questionDetails = {
  dataset_query: {
    type: "query",
    database: SAMPLE_DB_ID,
    query: {
      "source-query": {
        "source-table": ORDERS_ID,
        joins: [
          {
            fields: "all",
            "source-table": PEOPLE_ID,
            condition: [
              "=",
              ["field", ORDERS.USER_ID, null],
              ["field", PEOPLE.ID, { "join-alias": "People - User" }],
            ],
            alias: "People - User",
          },
        ],
        aggregation: [["count"]],
        breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
      },
      filter: [">", ["field", "count", { "base-type": "type/Integer" }], 0],
    },
  },
};

describe("issue 25990", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", `/api/dataset`).as("dataset");
  });

  it("should allow to filter by a column in a joined table (metabase#25990)", () => {
    visitQuestionAdhoc(questionDetails);

    queryBuilderHeader().button("Filter").click();

    cy.get(".Modal").within(() => {
      cy.findByText("People - User").click();
      cy.findByPlaceholderText("Enter an ID").type("10");
      cy.button("Apply Filters").click();
    });

    cy.wait("@dataset");

    cy.findByTestId("qb-filters-panel")
      .findByText("People - User → ID is 10")
      .should("be.visible");
  });
});
