import { restore, visitQuestionAdhoc } from "__support__/e2e/helpers";

import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";

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
        "pie.show_data_labels": true,
        "pie.dimension": "X",
        "pie.metric": "Y",
      },
    });

    cy.findByText("2,610");
    cy.createPercySnapshot();
  });
});
