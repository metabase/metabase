import { restore, visitQuestionAdhoc } from "__support__/e2e/cypress";
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
        database: 1,
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
