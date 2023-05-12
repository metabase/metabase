import { restore } from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, PEOPLE, PEOPLE_ID } = SAMPLE_DATABASE;

describe("issue 18630", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    restore();
    cy.signInAsAdmin();
  });

  const QUERY_WITH_FIELD_CLAUSE = {
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
      expressions: {
        coalesce: [
          "coalesce",
          ["field", ORDERS.USER_ID, null],
          ["field", PEOPLE.ID, { "join-alias": "People - User" }],
        ],
      },
      aggregation: [["count"]],
      breakout: [["expression", "coalesce"]],
    },
    joins: [
      {
        fields: "all",
        "source-table": PEOPLE_ID,
        condition: [
          "=",
          ["field", "coalesce", { "base-type": "type/Float" }],
          ["field", PEOPLE.ID, { "join-alias": "People" }],
        ],
        alias: "People",
      },
    ],
  };

  it("should normally open queries with field literals in joins (metabase#18630)", () => {
    cy.createQuestion(
      { query: QUERY_WITH_FIELD_CLAUSE },
      { visitQuestion: true },
    );

    // The query runs and we assert the page is not blank,
    // rather than an infinite loop and stack overflow.
    // 'test question' is the name of the question.
    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("test question");
  });
});
