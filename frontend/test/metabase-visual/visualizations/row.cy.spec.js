import {
  restore,
  visitQuestionAdhoc,
  ensureDcChartVisibility,
} from "__support__/e2e/helpers";

import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const testQuery = {
  type: "query",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [["field", PRODUCTS.PRICE, { binning: { strategy: "default" } }]],
  },
  database: SAMPLE_DB_ID,
};

describe("visual tests > visualizations > row", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
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

    ensureDcChartVisibility();
    cy.percySnapshot();
  });
});
