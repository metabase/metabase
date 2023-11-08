import { restore, visitQuestionAdhoc } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATASET;

const testQuery = {
  type: "query",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [["field", PRODUCTS.PRICE, { binning: { strategy: "default" } }]],
  },
  database: 1,
};

describe("visual tests > visualizations > row", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.server();
    cy.route("POST", "/api/dataset").as("dataset");
  });

  it("with formatted x-axis", () => {
    visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "row",
      displayIsLocked: true,
      visualization_settings: {
        column_settings: {
          '["name","count"]': { suffix: " items", number_style: "decimal" },
        },
      },
    });

    cy.wait("@dataset");

    cy.percySnapshot();
  });
});
