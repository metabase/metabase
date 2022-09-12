import { restore } from "__support__/e2e/helpers";

import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";
import { turnIntoModel } from "./helpers/e2e-models-helpers";
const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > models with aggregation and breakout", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("PUT", "/api/card/*").as("updateCard");

    cy.createQuestion(
      {
        name: "model with aggregation & breakout",
        display: "line",
        query: {
          "source-table": ORDERS_ID,
          aggregation: [["distinct", ["field", ORDERS.PRODUCT_ID, null]]],
          breakout: [
            ["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }],
          ],
        },
      },
      { visitQuestion: true },
    );
  });

  it("should be possible to convert a question with an aggregation and breakout into a model", () => {
    turnIntoModel();
    cy.wait("@updateCard");

    cy.findByText("Created At: Month");
    cy.findByText("Distinct values of Product ID");
  });
});
