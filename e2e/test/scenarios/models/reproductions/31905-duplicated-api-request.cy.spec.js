import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { restore } from "e2e/support/helpers";

const { ORDERS_ID } = SAMPLE_DATABASE;

describe("issue 31905", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();

    cy.intercept("GET", "/api/card/*").as("card");

    cy.createQuestion(
      {
        name: "Orders Model",
        type: "model",
        query: { "source-table": ORDERS_ID, limit: 2 },
      },
      { visitQuestion: true },
    );
  });

  it("should not send more than one same api requests to load a model (metabase#31905)", () => {
    cy.get("@card.all").should("have.length", 1);
  });
});
