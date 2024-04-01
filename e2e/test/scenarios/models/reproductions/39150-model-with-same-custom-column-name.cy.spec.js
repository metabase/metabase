import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { createQuestion, restore } from "e2e/support/helpers";

const { ORDERS_ID, ORDERS } = SAMPLE_DATABASE;

const modelDetails = {
  type: "model",
  name: "Model 39150",
  query: {
    "source-table": ORDERS_ID,
    expressions: {
      Total: ["+", ["field", ORDERS.TOTAL, null], 1],
    },
    limit: 5,
  },
};

describe("issue 39150", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it("should render results if a model depends on a model and both have the same custom column name", () => {
    createQuestion(modelDetails).then(({ body: { id: modelId } }) => {
      createQuestion(
        {
          type: "model",
          name: "Model 39150 Child",
          query: {
            "source-table": `card__${modelId}`,
            expressions: {
              Total: ["+", ["field", ORDERS.TOTAL, null], 1],
            },
            limit: 5,
          },
        },
        { visitQuestion: true },
      );
    });

    cy.log("verify that rendered result has 3 'Total' columns");

    cy.get("[data-testid='header-cell']:contains('Total')").should(
      "have.length",
      3,
    );
  });
});
