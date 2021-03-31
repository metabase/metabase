import { restore, visitQuestionAdhoc } from "__support__/cypress";
import { SAMPLE_DATASET } from "__support__/cypress_sample_dataset";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATASET;

const testQuery = {
  type: "query",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [["field-id", PRODUCTS.CATEGORY]],
  },
  database: 1,
};

describe("scenarios > visualizations > pie chart", () => {
  beforeEach(() => {
    restore();
    cy.signInAsNormalUser();
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
          .should("exist");
      });
    });
  }

  it("renders a pie chart", () => {
    cy.server();
    cy.route("POST", "/api/dataset").as("dataset");

    visitQuestionAdhoc({
      dataset_query: testQuery,
      display: "pie",
    });

    cy.wait("@dataset");
    ensurePieChartRendered(["Doohickey", "Gadget", "Gizmo", "Widget"], 200);
  });
});
