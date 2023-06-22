import { restore, visitQuestionAdhoc } from "e2e/support/helpers";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";

describe("visual tests > visualizations > pie", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
  });

  it("with labels", () => {
    const testQuery = {
      type: "native",
      native: {
        query:
          "select 1 x, 1000 y\n" +
          "union all select 2 x, 800 y\n" +
          "union all select 3 x, 600 y\n" +
          "union all select 4 x, 200 y\n" +
          "union all select 5 x, 10 y\n",
      },
      database: SAMPLE_DB_ID,
    };

    visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "pie",
      visualization_settings: {
        "pie.percent_visibility": "inside",
        "pie.dimension": "X",
        "pie.metric": "Y",
      },
    });

    // eslint-disable-next-line no-unscoped-text-selectors -- deprecated usage
    cy.findByText("2,610");
    cy.createPercySnapshot();
  });
});
