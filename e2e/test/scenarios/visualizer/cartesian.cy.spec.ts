const { H } = cy;

import {
  ORDERS_COUNT_BY_CREATED_AT,
  PRODUCTS_AVERAGE_BY_CREATED_AT,
  PRODUCTS_COUNT_BY_CREATED_AT,
} from "e2e/support/test-visualizer-data";

describe("scenarios > visualizer > cartesian", () => {
  beforeEach(() => {
    H.restore();

    cy.intercept("POST", "/api/card/*/query").as("cardQuery");

    cy.signInAsNormalUser();

    H.createQuestion(ORDERS_COUNT_BY_CREATED_AT);
    H.createQuestion(PRODUCTS_COUNT_BY_CREATED_AT);
    H.createQuestion(PRODUCTS_AVERAGE_BY_CREATED_AT);
  });

  it("should work with more than two datasets (VIZ-693)", () => {
    H.createDashboard().then(({ body: { id: dashboardId } }) => {
      H.visitDashboard(dashboardId);
    });

    H.editDashboard();

    H.openQuestionsSidebar();
    H.clickVisualizeAnotherWay(ORDERS_COUNT_BY_CREATED_AT.name);

    H.modal().within(() => {
      H.switchToAddMoreData();
      H.selectDataset(PRODUCTS_COUNT_BY_CREATED_AT.name);
      H.assertWellItems({
        vertical: ["Count", "Count (Products by Created At (Month))"],
      });
      H.selectDataset(PRODUCTS_AVERAGE_BY_CREATED_AT.name);
      H.assertWellItems({
        vertical: [
          "Count",
          "Count (Products by Created At (Month))",
          "Average of Price",
        ],
      });
    });

    H.saveDashcardVisualizerModal({ mode: "create" });

    // the new dashcard is below the minimum size for showing a legend,
    // so enlarge it before asserting on the legend items
    H.resizeDashboardCard({ card: H.getDashboardCard(0), x: 2000, y: 600 });

    // Wait for card queries before saving the dashboard
    H.getDashboardCard(0).within(() => {
      cy.findByText(PRODUCTS_COUNT_BY_CREATED_AT.name).should("exist");
      cy.findByText("Created At: Month").should("exist");
    });

    H.saveDashboard();
    cy.reload();

    // Making sure the saved card renders all its series after a reload
    H.getDashboardCard(0).within(() => {
      H.chartLegendItems().should("have.length", 3);
      H.chartLegendItem(ORDERS_COUNT_BY_CREATED_AT.name).should("exist");
      H.chartLegendItem(PRODUCTS_COUNT_BY_CREATED_AT.name).should("exist");
      H.chartLegendItem(PRODUCTS_AVERAGE_BY_CREATED_AT.name).should("exist");
      cy.findByText("Created At: Month").should("exist");
    });
  });
});
