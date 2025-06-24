const { H } = cy;

import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import {
  ACCOUNTS_COUNT_BY_COUNTRY,
  COUNTRY_CODES,
  ORDERS_COUNT_BY_PRODUCT_CATEGORY,
} from "e2e/support/test-visualizer-data";

describe("scenarios > dashboard > visualizer > basics", () => {
  beforeEach(() => {
    H.restore();

    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );

    cy.signInAsNormalUser();

    H.createQuestion(ACCOUNTS_COUNT_BY_COUNTRY, {
      idAlias: "accountsCountByCountryQuestionId",
      entityIdAlias: "accountsCountByCountryQuestionEntityId",
      wrapId: true,
    });

    H.createQuestion(ORDERS_COUNT_BY_PRODUCT_CATEGORY, {
      idAlias: "ordersCountByProductCategoryQuestionId",
      entityIdAlias: "ordersCountByProductCategoryQuestionEntityId",
      wrapId: true,
    });
  });

  it("should remap columns when changing a viz type", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();

    H.openQuestionsSidebar();
    H.clickVisualizeAnotherWay(ORDERS_COUNT_BY_PRODUCT_CATEGORY.name);

    H.modal().within(() => {
      // Turn into a pie chart
      cy.findByTestId("viz-picker-main").icon("pie").click();
      H.assertDataSourceColumnSelected(
        ORDERS_COUNT_BY_PRODUCT_CATEGORY.name,
        "Count",
      );
      H.assertDataSourceColumnSelected(
        ORDERS_COUNT_BY_PRODUCT_CATEGORY.name,
        "Product → Category",
      );
      H.pieMetricWell().findByText("Count").should("exist");
      H.pieDimensionWell().findByText("Product → Category").should("exist");
      H.echartsContainer().findByText("18,760").should("exist"); // total value

      // Turn into a funnel
      cy.findByTestId("viz-picker-main").icon("funnel").click();
      H.assertDataSourceColumnSelected(
        ORDERS_COUNT_BY_PRODUCT_CATEGORY.name,
        "Count",
      );
      H.assertDataSourceColumnSelected(
        ORDERS_COUNT_BY_PRODUCT_CATEGORY.name,
        "Product → Category",
      );
      H.verticalWell().findByText("Count").should("exist");
      H.horizontalWell().within(() => {
        cy.findByText("Product → Category").should("exist");
        cy.findByText("Doohickey").should("exist");
        cy.findByText("Gadget").should("exist");
        cy.findByText("Gizmo").should("exist");
        cy.findByText("Widget").should("exist");
        cy.findAllByTestId("well-item").should("have.length", 5);
      });
    });
  });

  it("should preserve column mapping when switching between cartesian and pie", () => {
    H.createDashboard().then(({ body: { id: dashboardId } }) => {
      H.visitDashboard(dashboardId);
    });

    H.editDashboard();

    H.openQuestionsSidebar();
    H.clickVisualizeAnotherWay(ACCOUNTS_COUNT_BY_COUNTRY.name);

    H.modal().within(() => {
      H.assertWellItems({ horizontal: ["Country"], vertical: ["Count"] });

      // cartesian (starting point) -> funnel -> scatter
      H.selectVisualization("funnel");
      H.assertWellItems({
        horizontal: ["Country", ...COUNTRY_CODES],
        vertical: ["Count"],
      });
      H.selectVisualization("scatter");
      H.assertWellItems({ horizontal: ["Country"], vertical: ["Count"] });

      // Resetting the visualization to cartesian
      H.switchToAddMoreData();
      H.selectDataset(ACCOUNTS_COUNT_BY_COUNTRY.name);

      // cartesian (starting point) -> pie -> funnel -> scatter
      H.selectVisualization("pie");
      H.assertWellItems({ pieDimensions: ["Country"], pieMetric: ["Count"] });
      H.selectVisualization("funnel");
      H.assertWellItems({
        horizontal: ["Country", ...COUNTRY_CODES],
        vertical: ["Count"],
      });
      H.selectVisualization("scatter");
      H.assertWellItems({ horizontal: ["Country"], vertical: ["Count"] });
    });
  });
});
