import { restore, visitQuestionAdhoc } from "__support__/e2e/cypress";
import { SAMPLE_DATASET } from "__support__/e2e/cypress_sample_dataset";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATASET;

const testQuery = {
  type: "query",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [["field", PRODUCTS.CATEGORY, null]],
  },
  database: 1,
};

describe("scenarios > visualizations > pie chart", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
    cy.server();
  });

  it("should render a pie chart (metabase#12506)", () => {
    cy.route("POST", "/api/dataset").as("dataset");

    visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "pie",
    });

    cy.wait("@dataset");
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
      cy.get(".LegendItem")
        .contains(name)
        .should("be.visible");
    });
  });
}
