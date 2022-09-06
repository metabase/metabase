import { restore, visitQuestionAdhoc } from "__support__/e2e/helpers";

import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

describe("scenarios > visualizations > combo", () => {
  beforeEach(() => {
    restore();
    cy.signInAsAdmin();
  });

  it(`should render values on data points`, () => {
    visitQuestionAdhoc({
      dataset_query: {
        database: SAMPLE_DB_ID,
        query: {
          "source-table": PRODUCTS_ID,
          aggregation: [["count"], ["sum", ["field", PRODUCTS.PRICE, null]]],
          breakout: [
            [
              "field",
              PRODUCTS.CREATED_AT,
              {
                "temporal-unit": "month",
              },
            ],
          ],
        },
        type: "query",
      },
      display: "combo",
      displayIsLocked: true,
      visualization_settings: {
        "graph.show_values": true,
      },
    });
    // First value label on the chart
    cy.findAllByText("136.83");
  });
});
