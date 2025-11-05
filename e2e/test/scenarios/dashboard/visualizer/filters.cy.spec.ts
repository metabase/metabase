const { H } = cy;

import {
  PRODUCTS_AVERAGE_BY_CATEGORY,
  PRODUCTS_COUNT_BY_CATEGORY,
} from "e2e/support/test-visualizer-data";

describe("scenarios > dashboard > visualizer > filters", () => {
  beforeEach(() => {
    H.restore();

    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );

    cy.signInAsNormalUser();

    H.createQuestion(PRODUCTS_COUNT_BY_CATEGORY, {
      idAlias: "productsCountByCategoryQuestionId",
      wrapId: true,
    });

    H.createQuestion(PRODUCTS_AVERAGE_BY_CATEGORY, {
      idAlias: "productsAvgByCreatedAtQuestionId",
      wrapId: true,
    });
  });

  // TODO those two datasets should be compatible with each other
  it(
    "should create and update a dashcard with 'Visualize another way' button",
    { tags: "@skip" },
    () => {
      H.createDashboard().then(({ body: { id: dashboardId } }) => {
        H.visitDashboard(dashboardId);
      });

      H.editDashboard();
      H.openQuestionsSidebar();
      H.clickVisualizeAnotherWay(PRODUCTS_COUNT_BY_CATEGORY.name);

      H.modal().within(() => {
        H.switchToAddMoreData();
        H.selectDataset(PRODUCTS_AVERAGE_BY_CATEGORY.name);

        H.assertWellItemsCount({
          vertical: 2,
        });
      });

      H.saveDashcardVisualizerModal({ mode: "create" });

      H.setFilter("Text or Category", "Is");

      // Doing it twice to populate the two filters
      H.selectDashboardFilter(H.getDashboardCard(0), "Category");
      H.selectDashboardFilter(H.getDashboardCard(0), "Category");

      H.saveDashboard();

      H.getDashboardCard(0).within(() => {
        cy.findByText("Doohickey").should("exist");
      });

      H.filterWidget().contains("Text").click();
      H.popover().within(() => {
        cy.findByText("Gadget").click();
        cy.button("Add filter").click();
      });

      H.getDashboardCard(0).within(() => {
        cy.findByText("Doohickey").should("not.exist");
      });
    },
  );
});
