import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

const { H } = cy;

const FIX_MESSAGE = "Fixes applied. Run your query to view results.";

describe.skip("scenarios > native > ai sql fixer", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    H.activateToken("pro-self-hosted");
    cy.intercept("POST", "/api/ee/ai-sql-fixer/fix").as("fixSql");
  });

  it("should be able to fix SQL with AI", () => {
    H.visitQuestionAdhoc({
      display: "table",
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "native",
        native: {
          query: "SELECT1 * FROM ORDERS",
        },
      },
    });
    cy.wait("@fixSql");
    cy.findByTestId("query-visualization-root").within(() => {
      cy.button(/Have Metabot fix it/).click();
      cy.findByText(FIX_MESSAGE).should("be.visible");
    });
    H.runNativeQuery();
    H.NativeEditor.get()
      .should("be.visible")
      .and("contain", "SELECT * FROM ORDERS");
    cy.findByTestId("query-visualization-root").within(() => {
      H.tableInteractive().should("be.visible");
      cy.findByText(FIX_MESSAGE).should("not.exist");
    });
  });
});
