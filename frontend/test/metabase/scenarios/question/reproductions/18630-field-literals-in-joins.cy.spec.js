import { restore } from "__support__/e2e/cypress";

import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { ORDERS, ORDERS_ID, PEOPLE, PEOPLE_ID } = SAMPLE_DATASET;

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

    // The query itself is not expected to run,
    // it just shouldn't stuck on the loading phase
    cy.findByText("There was a problem with your question");
  });
});
