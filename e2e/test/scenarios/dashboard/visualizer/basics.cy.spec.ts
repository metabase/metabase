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
  createDashboardWithVisualizerDashcards,
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

  it("should create and update a dashcard with 'Visualize another way' button", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);

    H.editDashboard();
    H.openQuestionsSidebar();
    H.clickVisualizeAnotherWay(ORDERS_COUNT_BY_CREATED_AT.name);

    H.modal().within(() => {
      H.verticalWell().findByText("Count").should("exist");
      H.horizontalWell().findByText("Created At: Month").should("exist");

      cy.findByDisplayValue("line").should("be.checked");

      cy.button("Add to dashboard").click();
    });

    H.getDashboardCard(1).within(() => {
      cy.findByText(ORDERS_COUNT_BY_CREATED_AT.name).should("exist");
      cy.findByText("Count").should("exist");
      cy.findByText("Created At: Month").should("exist");
    });

    H.showDashcardVisualizerModal(1);

    H.modal().within(() => {
      cy.button("Add more data").click();
      cy.findByPlaceholderText("Search for something").type("Cre");

      cy.findByText(PRODUCTS_COUNT_BY_CREATED_AT.name).click();
      cy.wait("@cardQuery");

      cy.findByTestId("visualization-canvas").within(() => {
        cy.findByText("Count").should("exist");
      });

      cy.findByTestId("visualizer-header").within(() => {
        cy.findByText(`${PRODUCTS_COUNT_BY_CREATED_AT.name}`).should("exist");
      });
    });

    H.saveDashcardVisualizerModal();

    H.getDashboardCard(1).within(() => {
      cy.findByText(PRODUCTS_COUNT_BY_CREATED_AT.name).should("exist");
      cy.findByText("Count").should("exist");
      cy.findByText("Created At: Month").should("exist");
    });

    H.saveDashboard();

    H.getDashboardCard(1).within(() => {
      cy.findByText(PRODUCTS_COUNT_BY_CREATED_AT.name).should("exist");
      cy.findByText("Count").should("exist");
      cy.findByText("Created At: Month").should("exist");
    });
  });

  it("should update an existing dashcard with visualizer", () => {
    cy.get("@ordersCountByCreatedAtQuestionId").then(
      (ordersCountByCreatedAtQuestionId) => {
        H.addQuestionToDashboard({
          dashboardId: ORDERS_DASHBOARD_ID,
          cardId: ordersCountByCreatedAtQuestionId as any,
        });
        H.visitDashboard(ORDERS_DASHBOARD_ID);
        H.editDashboard();
      },
    );

    H.showDashcardVisualizerModal(1);

    H.modal().within(() => {
      cy.button("Add more data").click();
      cy.findByPlaceholderText("Search for something").type("Cre");

      cy.findByText(PRODUCTS_COUNT_BY_CREATED_AT.name).click();
      cy.wait("@cardQuery");

      cy.findByTestId("visualization-canvas").within(() => {
        cy.findByText("Count").should("exist");
      });

      cy.findByTestId("visualizer-header").within(() => {
        cy.findByText(`${PRODUCTS_COUNT_BY_CREATED_AT.name}`).should("exist");
      });
    });

    H.saveDashcardVisualizerModal();

    H.getDashboardCard(1).within(() => {
      cy.findByText(PRODUCTS_COUNT_BY_CREATED_AT.name).should("exist");
      cy.findByText("Count").should("exist");
      cy.findByText("Created At: Month").should("exist");
    });

    H.saveDashboard();

    H.getDashboardCard(1).within(() => {
      cy.findByText(PRODUCTS_COUNT_BY_CREATED_AT.name).should("exist");
      cy.findByText("Count").should("exist");
      cy.findByText("Created At: Month").should("exist");
    });
  });

  it("should rename a dashboard card", () => {
    createDashboardWithVisualizerDashcards();
    H.editDashboard();

    // Rename the first card and check
    // My chart -> "Renamed chart"
    H.showDashcardVisualizerModal(0);
    H.modal().within(() => {
      cy.findByDisplayValue("My chart").clear().type("Renamed chart").blur();
    });
    H.saveDashcardVisualizerModal();
    H.assertDashboardCardTitle(0, "Renamed chart");

    // Rename the third card and check
    // PRODUCTS_COUNT_BY_CREATED_AT.name -> "Another chart"
    H.showDashcardVisualizerModal(3);
    H.modal().within(() => {
      cy.findByDisplayValue(PRODUCTS_COUNT_BY_CREATED_AT.name)
        .clear()
        .type("Another chart")
        .blur();
    });
    H.saveDashcardVisualizerModal();
    H.assertDashboardCardTitle(3, "Another chart");

    // Clear the second card title
    // My category chart -> ""
    H.showDashcardVisualizerModal(1);
    H.modal().within(() => {
      cy.findByTestId("visualizer-title").clear().blur();
    });
    H.saveDashcardVisualizerModal();
    H.assertDashboardCardTitle(1, "");

    // Save the dashboard
    H.saveDashboard();

    // Check that the card titles are still good
    H.assertDashboardCardTitle(0, "Renamed chart");
    H.assertDashboardCardTitle(1, "");
    H.assertDashboardCardTitle(3, "Another chart");

    // Making sure the title is empty (not "My new visualization")
    H.editDashboard();
    H.showDashcardVisualizerModal(1);
    H.modal().within(() => {
      cy.findByTestId("visualizer-title").should("have.text", "");
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

  it("should start in a pristine state and update dirtyness accordingly", () => {
    createDashboardWithVisualizerDashcards();
    H.editDashboard();

    H.showDashcardVisualizerModal(0);

    // no changes, save button should be disabled
    H.modal().within(() => {
      cy.findByText("Save").closest("button").should("be.disabled");
      // hit escape
      cy.realPress("Escape");
    });
    H.modal().should("not.exist");

    // change the visualization type, save button should be enabled
    H.showDashcardVisualizerModal(0);
    H.selectVisualization("bar");
    H.modal().within(() => {
      cy.findByText("Save").closest("button").should("not.be.disabled");
    });
  });

  it("should allow navigating through change history", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);

    H.editDashboard();
    H.openQuestionsSidebar();
    H.clickVisualizeAnotherWay(ORDERS_COUNT_BY_CREATED_AT.name);

    H.modal().within(() => {
      cy.findByLabelText("Back").as("undoButton");
      cy.findByLabelText("Forward").as("redoButton");

      cy.get("@undoButton").should("be.disabled");
      cy.get("@redoButton").should("be.disabled");

      H.switchToAddMoreData();
      H.addDataset(PRODUCTS_COUNT_BY_CREATED_AT.name);
      H.switchToColumnsList();

      // Undo adding a new data source
      cy.get("@redoButton").should("be.disabled");
      cy.get("@undoButton").click();
      cy.get("@undoButton").should("be.disabled");

      H.dataImporter().within(() => {
        cy.findByText(ORDERS_COUNT_BY_CREATED_AT.name).should("exist");
        cy.findByText(PRODUCTS_COUNT_BY_CREATED_AT.name).should("not.exist");
      });
      H.verticalWell().findAllByTestId("well-item").should("have.length", 1);

      // Redo adding a new data source
      cy.get("@redoButton").click();
      cy.get("@redoButton").should("be.disabled");

      H.dataImporter().within(() => {
        cy.findByText(ORDERS_COUNT_BY_CREATED_AT.name).should("exist");
        cy.findByText(PRODUCTS_COUNT_BY_CREATED_AT.name).should("exist");
      });
      H.verticalWell().findAllByTestId("well-item").should("have.length", 2);

      // Remove a column
      H.deselectColumnFromColumnsList(
        PRODUCTS_COUNT_BY_CREATED_AT.name,
        "Count",
      );

      // Undo removing a column
      cy.get("@redoButton").should("be.disabled");
      cy.get("@undoButton").click();

      H.verticalWell().findAllByTestId("well-item").should("have.length", 2);

      // Redo removing a column
      cy.get("@redoButton").click();
      cy.get("@redoButton").should("be.disabled");

      H.verticalWell().findAllByTestId("well-item").should("have.length", 1);

      // Change viz settings (add goal line)
      cy.findByText("Settings").click();
      cy.findByTestId("chartsettings-sidebar").findByText("Goal line").click();
      H.goalLine().should("exist");

      // Undo goal line
      cy.get("@undoButton").click();
      H.goalLine().should("not.exist");

      // // Ensure UI state isn't tracked in history
      cy.findByTestId("chartsettings-sidebar").should("be.visible");

      // // Redo goal line
      cy.get("@redoButton").click();
      H.goalLine().should("exist");

      cy.button("Add to dashboard").click();
    });

    // TODO editing a dashcard when it isn't done loading
    // causes the visualizr modal to be in error for some reason
    // this should be fixed in the future
    cy.wait(1000);

    // Ensure history set is reset
    H.showDashcardVisualizerModal(1);

    H.modal().within(() => {
      cy.get("@undoButton").should("be.disabled");
      cy.get("@redoButton").should("be.disabled");
      cy.findByTestId("chartsettings-sidebar").should("not.be.visible");
    });
  });

  it("should add the proper tabId to a new card", () => {
    // make an empty dashboard
    H.createDashboard().then(({ body: { id: dashboardId } }) => {
      H.visitDashboard(dashboardId);
    });

    // edit the dashboard
    H.editDashboard();

    // add a new tab
    H.createNewTab();

    // save the dashboard
    H.saveDashboard();

    // edit the dashboard
    H.editDashboard();

    // delete the first tab so it defaults to the second tab
    H.deleteTab("Tab 1");

    // save the dashboard
    H.saveDashboard();

    // edit the dashboard
    H.editDashboard();

    // add a new card to the first tab
    H.openQuestionsSidebar();
    H.clickVisualizeAnotherWay(ORDERS_COUNT_BY_CREATED_AT.name);
    cy.wait("@cardQuery");
    H.modal().within(() => {
      cy.findByText("Add to dashboard").click({ force: true });
    });

    // // save the dashboard
    H.saveDashboard();

    // // check that the dashboard saved and the card is in the first tab
    H.getDashboardCard(0).within(() => {
      cy.findByText(ORDERS_COUNT_BY_CREATED_AT.name).should("exist");
    });
  });
});
