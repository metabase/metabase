const { H } = cy;

import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import {
  ORDERS_COUNT_BY_CREATED_AT,
  ORDERS_COUNT_BY_PRODUCT_CATEGORY,
  PRODUCTS_COUNT_BY_CATEGORY,
  PRODUCTS_COUNT_BY_CATEGORY_PIE,
  PRODUCTS_COUNT_BY_CREATED_AT,
  SCALAR_CARD,
  STEP_COLUMN_CARD,
  VIEWS_COLUMN_CARD,
} from "e2e/support/test-visualizer-data";

describe("scenarios > dashboard > visualizer > funnels", () => {
  beforeEach(() => {
    H.restore();

    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashcardQuery",
    );

    cy.signInAsNormalUser();

    H.createQuestion(ORDERS_COUNT_BY_CREATED_AT, {
      idAlias: "ordersCountByCreatedAtQuestionId",
      wrapId: true,
    });
    H.createQuestion(ORDERS_COUNT_BY_PRODUCT_CATEGORY, {
      idAlias: "ordersCountByProductCategoryQuestionId",
      wrapId: true,
    });
    H.createQuestion(PRODUCTS_COUNT_BY_CREATED_AT, {
      idAlias: "productsCountByCreatedAtQuestionId",
      wrapId: true,
    });
    H.createQuestion(PRODUCTS_COUNT_BY_CATEGORY, {
      idAlias: "productsCountByCategoryQuestionId",
      wrapId: true,
    });
    H.createQuestion(PRODUCTS_COUNT_BY_CATEGORY_PIE, {
      idAlias: "productsCountByCategoryPieQuestionId",
      wrapId: true,
    });
    H.createNativeQuestion(SCALAR_CARD.LANDING_PAGE_VIEWS, {
      idAlias: "landingPageViewsScalarQuestionId",
      wrapId: true,
    });
    H.createNativeQuestion(SCALAR_CARD.CHECKOUT_PAGE_VIEWS, {
      idAlias: "checkoutPageViewsScalarQuestionId",
      wrapId: true,
    });
    H.createNativeQuestion(SCALAR_CARD.PAYMENT_DONE_PAGE_VIEWS, {
      idAlias: "paymentDonePageViewsScalarQuestionId",
      wrapId: true,
    });
    H.createNativeQuestion(STEP_COLUMN_CARD, {
      idAlias: "stepColumnQuestionId",
      wrapId: true,
    });
    H.createNativeQuestion(VIEWS_COLUMN_CARD, {
      idAlias: "viewsColumnQuestionId",
      wrapId: true,
    });
  });

  it("should build a funnel", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();

    H.openQuestionsSidebar();
    H.clickVisualizeAnotherWay(STEP_COLUMN_CARD.name);

    H.modal().within(() => {
      H.selectVisualization("funnel");

      cy.button("Add more data").click();
      H.selectDataset(VIEWS_COLUMN_CARD.name);
      cy.button("Done").click();

      H.assertDataSourceColumnSelected(STEP_COLUMN_CARD.name, "Step");
      H.assertDataSourceColumnSelected(VIEWS_COLUMN_CARD.name, "Views");

      H.verticalWell().within(() => {
        cy.findByText("Views").should("exist");
        cy.findAllByTestId("well-item").should("have.length", 1);
      });
      H.horizontalWell().within(() => {
        cy.findByText("Step").should("exist");
        cy.findByText("Checkout page").should("exist");
        cy.findByText("Landing page").should("exist");
        cy.findByText("Payment done page").should("exist");
        cy.findAllByTestId("well-item").should("have.length", 4);
      });

      // Remove a column from the data manager
      H.dataSourceColumn(STEP_COLUMN_CARD.name, "Step")
        .findByLabelText("Remove")
        .click();
      H.assertDataSourceColumnSelected(STEP_COLUMN_CARD.name, "Step", false);
      H.verticalWell().within(() => {
        cy.findByText("Views").should("exist");
        cy.findAllByTestId("well-item").should("have.length", 1);
      });
      H.horizontalWell().within(() => {
        cy.findByText("(empty)").should("exist");
        cy.findAllByTestId("well-item").should("have.length", 1);
      });

      // Add a column back
      H.dataSourceColumn(STEP_COLUMN_CARD.name, "Step").click();
      H.assertDataSourceColumnSelected(STEP_COLUMN_CARD.name, "Step");
      H.verticalWell().within(() => {
        cy.findByText("Views").should("exist");
        cy.findAllByTestId("well-item").should("have.length", 1);
      });
      H.horizontalWell().within(() => {
        cy.findByText("Step").should("exist");
        cy.findAllByTestId("well-item").should("have.length", 4);
      });

      // Remove the metric column from the well
      H.verticalWell()
        .findByTestId("well-item")
        .findByLabelText("Remove")
        .click();
      H.assertDataSourceColumnSelected(VIEWS_COLUMN_CARD.name, "Views", false);
      H.verticalWell().findAllByTestId("well-item").should("have.length", 0);
      H.horizontalWell().findAllByTestId("well-item").should("have.length", 4);

      // Remove the dimension column from the well
      H.horizontalWell()
        .findAllByTestId("well-item")
        .first()
        .findByLabelText("Remove")
        .click();
      H.assertDataSourceColumnSelected(STEP_COLUMN_CARD.name, "Step", false);
      H.verticalWell().findAllByTestId("well-item").should("have.length", 0);
      H.horizontalWell().findAllByTestId("well-item").should("have.length", 0);

      // Rebuild the funnel
      H.dataSourceColumn(STEP_COLUMN_CARD.name, "Step").click();
      H.dataSourceColumn(VIEWS_COLUMN_CARD.name, "Views").click();
      H.assertDataSourceColumnSelected(STEP_COLUMN_CARD.name, "Step");
      H.assertDataSourceColumnSelected(VIEWS_COLUMN_CARD.name, "Views");
      H.verticalWell().within(() => {
        cy.findByText("Views").should("exist");
        cy.findAllByTestId("well-item").should("have.length", 1);
      });
      H.horizontalWell().within(() => {
        cy.findByText("Step").should("exist");
        cy.findAllByTestId("well-item").should("have.length", 4);
      });

      // Remove a data source
      H.removeDataSource(VIEWS_COLUMN_CARD.name);
      H.dataImporter().within(() => {
        cy.findByText(VIEWS_COLUMN_CARD.name).should("not.exist");
        cy.findByText("Views").should("not.exist");
      });
      H.verticalWell().findAllByTestId("well-item").should("have.length", 0);
      H.horizontalWell().findAllByTestId("well-item").should("have.length", 4);
    });
  });

  it("should build a funnel of several scalar cards", () => {
    const { LANDING_PAGE_VIEWS, CHECKOUT_PAGE_VIEWS, PAYMENT_DONE_PAGE_VIEWS } =
      SCALAR_CARD;

    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();

    H.openQuestionsSidebar();
    H.clickVisualizeAnotherWay(LANDING_PAGE_VIEWS.name);

    H.modal().within(() => {
      H.switchToAddMoreData();
      H.selectDataset(CHECKOUT_PAGE_VIEWS.name);
      H.selectDataset(PAYMENT_DONE_PAGE_VIEWS.name);
      H.switchToColumnsList();

      H.assertDataSourceColumnSelected(LANDING_PAGE_VIEWS.name, "views");
      H.assertDataSourceColumnSelected(CHECKOUT_PAGE_VIEWS.name, "views");
      H.assertDataSourceColumnSelected(PAYMENT_DONE_PAGE_VIEWS.name, "views");

      H.verticalWell().within(() => {
        cy.findByText("METRIC").should("not.exist");
      });
      H.horizontalWell().within(() => {
        cy.findByText("DIMENSION").should("not.exist");
        cy.findByText(LANDING_PAGE_VIEWS.name).should("exist");
        cy.findByText(CHECKOUT_PAGE_VIEWS.name).should("exist");
        cy.findByText(PAYMENT_DONE_PAGE_VIEWS.name).should("exist");
        cy.findAllByTestId("well-item").should("have.length", 3);
      });

      // Remove a column from the data manager
      H.deselectColumnFromColumnsList(CHECKOUT_PAGE_VIEWS.name, "views");
      H.assertDataSourceColumnSelected(
        CHECKOUT_PAGE_VIEWS.name,
        "views",
        false,
      );
      H.verticalWell().within(() => {
        cy.findByText("METRIC").should("not.exist");
      });
      H.horizontalWell().within(() => {
        cy.findByText("DIMENSION").should("not.exist");
        cy.findAllByTestId("well-item").should("have.length", 2);
      });

      // Add a column back
      H.selectColumnFromColumnsList(CHECKOUT_PAGE_VIEWS.name, "views");
      H.assertDataSourceColumnSelected(CHECKOUT_PAGE_VIEWS.name, "views");
      H.verticalWell().within(() => {
        cy.findByText("METRIC").should("not.exist");
      });
      H.horizontalWell().within(() => {
        cy.findByText("DIMENSION").should("not.exist");
        cy.findAllByTestId("well-item").should("have.length", 3);
      });

      H.deselectColumnFromColumnsList(LANDING_PAGE_VIEWS.name, "views");
      H.deselectColumnFromColumnsList(CHECKOUT_PAGE_VIEWS.name, "views");
      H.deselectColumnFromColumnsList(PAYMENT_DONE_PAGE_VIEWS.name, "views");

      H.verticalWell().findAllByTestId("well-item").should("have.length", 0);
      H.horizontalWell().findAllByTestId("well-item").should("have.length", 0);

      // Rebuild the funnel
      H.selectColumnFromColumnsList(LANDING_PAGE_VIEWS.name, "views");
      H.selectColumnFromColumnsList(CHECKOUT_PAGE_VIEWS.name, "views");
      H.selectColumnFromColumnsList(PAYMENT_DONE_PAGE_VIEWS.name, "views");

      H.assertDataSourceColumnSelected(LANDING_PAGE_VIEWS.name, "views");
      H.assertDataSourceColumnSelected(CHECKOUT_PAGE_VIEWS.name, "views");
      H.assertDataSourceColumnSelected(PAYMENT_DONE_PAGE_VIEWS.name, "views");

      H.verticalWell().within(() => {
        cy.findByText("METRIC").should("not.exist");
      });
      H.horizontalWell().within(() => {
        cy.findByText("DIMENSION").should("not.exist");
        cy.findAllByTestId("well-item").should("have.length", 3);
      });
    });
  });

  it("should initialize a scalar funnel when opening a scalar card (VIZ-678)", () => {
    const { LANDING_PAGE_VIEWS, CHECKOUT_PAGE_VIEWS, PAYMENT_DONE_PAGE_VIEWS } =
      SCALAR_CARD;

    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();

    H.openQuestionsSidebar();
    H.clickVisualizeAnotherWay(LANDING_PAGE_VIEWS.name);

    H.modal().within(() => {
      H.switchToAddMoreData();
      H.selectDataset(CHECKOUT_PAGE_VIEWS.name);
      H.selectDataset(PAYMENT_DONE_PAGE_VIEWS.name);

      H.verticalWell().within(() => {
        cy.findByText("METRIC").should("not.exist");
      });
      H.horizontalWell().within(() => {
        cy.findByText("DIMENSION").should("not.exist");
        cy.findByText(LANDING_PAGE_VIEWS.name).should("exist");
        cy.findByText(CHECKOUT_PAGE_VIEWS.name).should("exist");
        cy.findByText(PAYMENT_DONE_PAGE_VIEWS.name).should("exist");
        cy.findAllByTestId("well-item").should("have.length", 3);
      });
    });
  });
});
