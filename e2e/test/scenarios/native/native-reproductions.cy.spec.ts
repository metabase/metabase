import {
  restore,
  withDatabase,
  adhocQuestionHash,
  runNativeQuery,
  openNativeEditor,
} from "e2e/support/helpers";

describe("issue 11727", { tags: "@external" }, () => {
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
  beforeEach(() => {
    restore("postgres-12");
    cy.signInAsAdmin();
    cy.intercept("GET", "/api/database").as("getDatabases");
  });

  it("should cancel the native query via the keyboard shortcut (metabase#11727)", () => {
    withDatabase(PG_DB_ID, () => {
      cy.visit("/question#" + adhocQuestionHash(questionDetails));
      cy.wait("@getDatabases");

      runNativeQuery({ wait: false });
      cy.findByText("Doing science...").should("be.visible");
      cy.get("body").type("{cmd}{enter}");
      cy.findByText("Here's where your results will appear").should(
        "be.visible",
      );
    });
  });
});

describe("issue 16584", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("should pass parameters when running with 'Run select text' (metabase#16584)", () => {
    // The bug described in is #16584 can be further simplified:
    // - the issue persists even when selecting the *entire* query
    // - the issue is unrelated to using a date filter, using a text filter works too
    // - the issue is unrelated to whether or not the parameter is required or if default value is set
    // - the space at the end of the query is not needed to reproduce this issue
    openNativeEditor()
      .type(
        "SELECT COUNTRY FROM ACCOUNTS WHERE COUNTRY = {{ country }} LIMIT 1",
        {
          parseSpecialCharSequences: false,
          delay: 0,
        },
      )
      .type("{selectAll}");

    cy.findByPlaceholderText("Country").type("NL", { delay: 0 });

    runNativeQuery();

    cy.findByTestId("query-visualization-root")
      .findByText("NL")
      .should("exist");
  });
});
