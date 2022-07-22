import {
  restore,
  withDatabase,
  adhocQuestionHash,
} from "__support__/e2e/helpers";

const PG_DB_ID = 2;

const questionDetails = {
  dataset_query: {
    type: "native",
    database: PG_DB_ID,
    native: {
      query: "SELECT pg_sleep(10)",
    },
  },
};

describe("issue 11727", () => {
  beforeEach(() => {
    restore("postgres-12");
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/database").as("getDatabases");
  });

  it("should cancel the native query via the keyboard shortcut (metabase#11727)", () => {
    withDatabase(PG_DB_ID, () => {
      cy.visit(`/question#` + adhocQuestionHash(questionDetails));
      cy.wait("@getDatabases");

      cy.findByText("Doing science...").should("be.visible");
      cy.get("body").type("{cmd}{enter}");
      cy.findByText("Here's where your results will appear").should(
        "be.visible",
      );
    });
  });
});
