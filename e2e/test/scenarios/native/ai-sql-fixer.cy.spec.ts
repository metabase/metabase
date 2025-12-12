import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

const { H } = cy;

describe("scenarios > native > ai sql fixer", () => {
  beforeEach(() => {
    H.resetSnowplow();
    H.restore();
    cy.signInAsAdmin();
    H.enableTracking();
    H.activateToken("bleeding-edge");
    cy.intercept("POST", "/api/ee/ai-sql-fixer/fix").as("fixSql");
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  it("should be able to fix SQL with AI", () => {
    H.visitQuestionAdhoc({
      display: "table",
      dataset_query: {
        database: SAMPLE_DB_ID,
        type: "native",
        native: {
          query: "SELECT1",
        },
      },
    });
    cy.findByTestId("query-visualization-root").within(() => {
      cy.button(/Have Metabot fix it/).click();
    });

    H.expectUnstructuredSnowplowEvent({
      event: "metabot_fix_query_clicked",
    });

    // TODO: Unskip this part once we have the means to run AI in CI
    // cy.findByTestId("metabot-chat-messages").should(
    //   "contain",
    //   "Fix this SQL query",
    // );
    // H.NativeEditor.get().should("be.visible").and("contain", "SELECT 1");
  });
});
