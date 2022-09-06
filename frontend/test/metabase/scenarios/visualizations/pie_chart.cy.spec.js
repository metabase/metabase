import { restore, visitQuestionAdhoc } from "__support__/e2e/helpers";

import { SAMPLE_DB_ID } from "__support__/e2e/cypress_data";
import { SAMPLE_DATABASE } from "__support__/e2e/cypress_sample_database";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

const testQuery = {
  type: "query",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [["field", PRODUCTS.CATEGORY, null]],
  },
  database: SAMPLE_DB_ID,
};

describe("scenarios > visualizations > pie chart", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.server();
  });

  it("should render a pie chart (metabase#12506)", () => {
    visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "pie",
    });

    ensurePieChartRendered(["Doohickey", "Gadget", "Gizmo", "Widget"], 200);
  });
});

function ensurePieChartRendered(rows, totalValue) {
  cy.get(".Visualization").within(() => {
    // detail
    cy.findByText("Total").should("be.visible");
    cy.findByTestId("detail-value").should("have.text", totalValue);

    // slices
    cy.findAllByTestId("slice").should("have.length", rows.length);

    // legend
    rows.forEach((name, i) => {
      cy.get(".LegendItem").contains(name).should("be.visible");
    });
  });
}
