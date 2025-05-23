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
    cy.intercept("GET", "/api/setting/version-info", {});

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

  it("should allow to visualize an existing dashcard another way if its viz type isn't supported by visualizer", () => {
    const dashCard = () => H.getDashboardCard(0);

    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();
    H.findDashCardAction(dashCard(), "Visualize another way").click();

    H.modal().within(() => {
      H.assertDataSourceColumnSelected("Orders", "ID");
      H.assertDataSourceColumnSelected("Orders", "Subtotal");
      H.verticalWell().findAllByTestId("well-item").should("have.length", 1);
      H.horizontalWell().findAllByTestId("well-item").should("have.length", 1);
      H.assertCurrentVisualization("bar");
      cy.button("Save").click();
    });

    dashCard().within(() => {
      H.echartsContainer().within(() => {
        cy.findByText("Subtotal").should("exist");
        cy.findByText("ID").should("exist");
      });
    });

    H.findDashCardAction(dashCard(), "Visualize another way").should(
      "not.exist",
    );
    H.findDashCardAction(dashCard(), "Show visualization options").should(
      "not.exist",
    );

    H.findDashCardAction(dashCard(), "Edit visualization").click();
    H.modal().button("Save").should("be.disabled");
  });

  it("should allow clicking on the title", () => {
    createDashboardWithVisualizerDashcards();

    // Click on both series of the first chart
    // Series 1
    H.showUnderlyingQuestion(0, ORDERS_COUNT_BY_CREATED_AT.name);
    cy.url().should("contain", "80-orders-by-created-at-month");
    cy.findByLabelText("Back to Test Dashboard").click();
    cy.url().should("contain", "10-test-dashboard");

    // Series 2
    H.showUnderlyingQuestion(0, PRODUCTS_COUNT_BY_CREATED_AT.name);
    cy.url().should("contain", "82-products-by-created-at-month");
    cy.findByLabelText("Back to Test Dashboard").click();
    cy.url().should("contain", "10-test-dashboard");

    // Click on the fifth chart (a funnel)
    H.showUnderlyingQuestion(4, STEP_COLUMN_CARD.name);
    cy.url().should("contain", "88-step-column");
    cy.findByLabelText("Back to Test Dashboard").click();
    cy.url().should("contain", "10-test-dashboard");
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

    // save the dashboard
    H.saveDashboard();

    // check that the dashboard saved and the card is in the first tab
    H.getDashboardCard(0).within(() => {
      cy.findByText(ORDERS_COUNT_BY_CREATED_AT.name).should("exist");
    });
  });

  it("should allow adding a dataset after a card is created (VIZ-926)", () => {
    H.createDashboard().then(({ body: { id: dashboardId } }) => {
      H.visitDashboard(dashboardId);
    });

    H.editDashboard();

    H.openQuestionsSidebar();
    H.clickVisualizeAnotherWay(ORDERS_COUNT_BY_CREATED_AT.name);

    H.saveDashcardVisualizerModal("create");
    H.saveDashboard();

    H.editDashboard();
    H.showDashcardVisualizerModal(0);

    H.switchToAddMoreData();
    H.addDataset(PRODUCTS_COUNT_BY_CREATED_AT.name);
    H.assertWellItemsCount({ vertical: 2 });
    H.saveDashcardVisualizerModal();
    H.saveDashboard();

    // Making sure the card renders
    H.getDashboardCard(0).within(() => {
      cy.findAllByText(`Count (${PRODUCTS_COUNT_BY_CREATED_AT.name})`).should(
        "have.length",
        2,
      );
      cy.findByText("Created At: Month").should("exist");
    });
  });

  it("should not store all computed settings in visualizer settings (VIZ-905)", () => {
    H.createDashboard().then(({ body: { id: dashboardId } }) => {
      H.visitDashboard(dashboardId);

      H.editDashboard();

      H.openQuestionsSidebar();
      H.clickVisualizeAnotherWay(ORDERS_COUNT_BY_CREATED_AT.name);
      H.modal().within(() => {
        H.switchToAddMoreData();
        H.addDataset("Products by Created At (Month)");
        H.assertWellItems({
          vertical: ["Count", "Count (Products by Created At (Month))"],
        });
      });
      H.saveDashcardVisualizerModal("create");
      H.saveDashboard();

      cy.intercept("GET", `/api/dashboard/${dashboardId}*`).as("dashboardLoad");
      cy.reload();

      cy.wait("@dashboardLoad").then(({ response }) => {
        const visualizerSettings =
          response?.body?.dashcards[0]?.visualization_settings?.visualization
            ?.settings;

        expect(Object.keys(visualizerSettings)).to.have.length(3);
        expect(visualizerSettings).to.eql({
          "graph.dimensions": ["COLUMN_1", "COLUMN_4"],
          "graph.metrics": ["COLUMN_2", "COLUMN_3"],
          "card.title": "Orders by Created At (Month)",
        });
      });
    });
  });

  describe("public sharing and embedding", () => {
    function ensureVisualizerCardsAreRendered() {
      // Checks a cartesian chart has an axis name
      H.getDashboardCard(0).within(() => {
        H.echartsContainer().findByText("Count").should("be.visible");
      });

      // Checks a funnel has a step name
      H.getDashboardCard(5)
        .findByText("Checkout Page")
        .scrollIntoView()
        .should("be.visible");
    }

    it("visualizer cards should work in public dashboards", () => {
      cy.signInAsAdmin();
      createDashboardWithVisualizerDashcards();
      cy.log("Visit public dashboard");
      cy.get("@dashboardId")
        .then((dashboardId) => {
          H.createPublicDashboardLink(dashboardId);
        })
        .then(({ body: { uuid } }: any) => {
          cy.visit(`/public/dashboard/${uuid}`);
        });

      ensureVisualizerCardsAreRendered();
    });

    it("visualizer cards should work in embedded dashboards", () => {
      cy.signInAsAdmin();
      createDashboardWithVisualizerDashcards({ enable_embedding: true });
      cy.log("Visit public dashboard");

      cy.get("@dashboardId").then((dashboard: any) => {
        H.visitEmbeddedPage({
          resource: { dashboard: dashboard },
          params: {},
        });
      });

      ensureVisualizerCardsAreRendered();
    });
  });
});
