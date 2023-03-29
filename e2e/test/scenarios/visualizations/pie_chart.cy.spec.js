import { restore, visitQuestionAdhoc } from "e2e/support/helpers";

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";

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
