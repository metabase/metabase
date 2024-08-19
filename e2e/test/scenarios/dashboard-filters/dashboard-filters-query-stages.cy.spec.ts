import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { createQuestion, restore } from "e2e/support/helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("scenarios > dashboard > filters > query stages", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
    // cy.intercept("POST", "/api/dataset").as("dataset");
  });

  it("TODO", () => {
    createQuestion(
      {
        query: {
          "source-table": ORDERS_ID,
        },
      },
      { visitQuestion: true },
    );
  });
});
