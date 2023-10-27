import { restore } from "e2e/support/helpers";

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

const { ORDERS, ORDERS_ID, REVIEWS, REVIEWS_ID } = SAMPLE_DATABASE;

describe("issue 18818", () => {
  beforeEach(() => {
    cy.intercept("POST", "/api/dataset").as("dataset");
    restore();
    cy.signInAsAdmin();
  });

  it("should normally open notebook editor for queries joining on custom columns (metabase#18818)", () => {
    cy.createQuestion(
      {
        query: {
          "source-table": REVIEWS_ID,
          expressions: {
            "CC Rating": ["field", REVIEWS.RATING],
          },
          joins: [
            {
              fields: "all",
              "source-table": ORDERS_ID,
              condition: [
                "=",
                ["expression", "CC Rating"],
                ["field", ORDERS.QUANTITY, { "join-alias": "Orders" }],
              ],
            },
          ],
        },
      },
      { visitQuestion: true },
    );

    cy.icon("notebook").click();
    cy.findAllByText("CC Rating");
  });
});
