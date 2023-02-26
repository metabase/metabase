import { restore, visitQuestionAdhoc } from "e2e/support/helpers";
import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

describe("visual tests > visualizations > funnel", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("empty", () => {
    const testQuery = {
      type: "native",
      native: {
        query:
          "select 'a' col1, 0 col2 union all\n" +
          "select 'b', 0 union all\n" +
          "select 'c', 0",
      },
      database: SAMPLE_DB_ID,
    };

    visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "funnel",
      visualization_settings: {
        "funnel.type": "funnel",
      },
    });

    cy.findByTestId("funnel-chart");
    cy.createPercySnapshot();
  });

  it("normal", () => {
    const testQuery = {
      type: "native",
      native: {
        query:
          "select 'a' step, 1000 users union all\n" +
          "select 'b', 800 union all\n" +
          "select 'c', 400 union all\n" +
          "select 'd', 155 union all\n" +
          "select 'e', 0",
      },
      database: SAMPLE_DB_ID,
    };

    visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "funnel",
      visualization_settings: {
        "funnel.type": "funnel",
      },
    });

    cy.findByTestId("funnel-chart");
    cy.createPercySnapshot();
  });
});
