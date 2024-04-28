import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { createQuestion, restore } from "e2e/support/helpers";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

// TODO: unskip once 39150 is fixed
describe.skip("issue 39150", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  ["model", "question"].forEach(type => {
    it(`should render results if a ${type} depends on a ${type} and both have the same custom column name (metabase#39150)`, () => {
      createQuestion({
        type,
        name: `${type} 39150`,
        query: {
          "source-table": ORDERS_ID,
          expressions: {
            Total: ["+", ["field", ORDERS.TOTAL, null], 1],
          },
          limit: 5,
        },
      }).then(({ body: { id: questionId } }) => {
        createQuestion(
          {
            type,
            name: `${type} 39150 Child`,
            query: {
              "source-table": `card__${questionId}`,
              expressions: {
                Total: ["+", ["field", ORDERS.TOTAL, null], 1],
              },
            },
          },
          { visitQuestion: true },
        );
      });

      cy.log("verify that rendered result has 3 'Total' columns");

      cy.findAllByTestId("header-cell")
        .filter(":contains('Total')")
        .should("have.length", 3);
    });
  });
});
