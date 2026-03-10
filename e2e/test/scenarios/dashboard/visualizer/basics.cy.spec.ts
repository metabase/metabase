const { H } = cy;

import { SAMPLE_DB_ID } from "e2e/support/cypress_data";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import {
  ORDERS_COUNT_BY_CREATED_AT,
  ORDERS_COUNT_BY_PRODUCT_CATEGORY,
  PRODUCTS_AVERAGE_BY_CREATED_AT,
  PRODUCTS_COUNT_BY_CATEGORY,
  PRODUCTS_COUNT_BY_CATEGORY_PIE,
  PRODUCTS_COUNT_BY_CREATED_AT,
  SCALAR_CARD,
  STEP_COLUMN_CARD,
  VIEWS_COLUMN_CARD,
  createDashboardWithVisualizerDashcards,
} from "e2e/support/test-visualizer-data";

// TODO editing a dashcard when it isn't done loading
// causes the visualizer modal to be in error for some reason
// this should be fixed in the future
const DASHCARD_QUERY_WAIT_TIME = 1000;

// There's a race condition when saving a dashboard
// and then immediately editing it again. After saving,
// we exit the edit mode and that can happen after
// `H.editDashboard` is called for some reason
const DASHBOARD_SAVE_WAIT_TIME = 450;

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
    H.createQuestion(PRODUCTS_AVERAGE_BY_CREATED_AT, {
      idAlias: "productsAverageByCreatedAtQuestionId",
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

      H.assertWellItems({
        vertical: ["Count", "Count (Products by Created At (Month))"],
        horizontal: ["Created At: Month"],
      });
    });

    H.saveDashcardVisualizerModal();

    H.getDashboardCard(1).within(() => {
      cy.findAllByText(ORDERS_COUNT_BY_CREATED_AT.name).should("exist");
      cy.findAllByText(PRODUCTS_COUNT_BY_CREATED_AT.name).should("exist");
      cy.findByText("Created At: Month").should("exist");
    });

    H.saveDashboard();

    H.getDashboardCard(1).within(() => {
      cy.findAllByText(ORDERS_COUNT_BY_CREATED_AT.name).should("exist");
      cy.findAllByText(PRODUCTS_COUNT_BY_CREATED_AT.name).should("exist");
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

    H.showDashcardVisualizerModal(1, {
      isVisualizerCard: false,
    });

    H.modal().within(() => {
      cy.button("Add more data").click();
      H.selectDataset(PRODUCTS_COUNT_BY_CREATED_AT.name);

      cy.findByTestId("visualization-canvas").within(() => {
        cy.findByText(`Count (${PRODUCTS_COUNT_BY_CREATED_AT.name})`).should(
          "exist",
        );
        cy.findAllByText("Created At: Month").should("exist");
      });

      cy.findByTestId("visualizer-header").within(() => {
        cy.findByText(`${ORDERS_COUNT_BY_CREATED_AT.name}`).should("exist");
      });
    });

    H.saveDashcardVisualizerModal();

    H.getDashboardCard(1).within(() => {
      cy.findByText(ORDERS_COUNT_BY_CREATED_AT.name).should("exist");
      cy.findByText(PRODUCTS_COUNT_BY_CREATED_AT.name).should("exist");
      cy.findAllByText("Created At: Month").should("exist");
    });

    H.saveDashboard();

    H.getDashboardCard(1).within(() => {
      cy.findByTestId("chart-container").within(() => {
        cy.findByText(ORDERS_COUNT_BY_CREATED_AT.name).should("exist");
        cy.findByText(PRODUCTS_COUNT_BY_CREATED_AT.name).should("exist");
        cy.findAllByText("Created At: Month").should("exist");
      });
    });
  });

  it("should allow to visualize an existing dashcard another way if its viz type isn't supported by visualizer", () => {
    const dashCard = () => H.getDashboardCard(0);

    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();
    dashCard()
      .realHover({ scrollBehavior: "bottom" })
      .findByLabelText("Visualize another way")
      .click();

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

    dashCard()
      .realHover({ scrollBehavior: "bottom" })
      .findByLabelText("Visualize another way")
      .should("not.exist");
    dashCard()
      .realHover({ scrollBehavior: "bottom" })
      .findByLabelText("Show visualization options")
      .should("not.exist");
    dashCard()
      .realHover({ scrollBehavior: "bottom" })
      .findByLabelText("Edit visualization")
      .click();

    H.modal().button("Save").should("be.disabled");
  });

  it("should allow clicking on the title", () => {
    createDashboardWithVisualizerDashcards();
    cy.findByTestId("loading-indicator").should("not.exist");
    H.getDashboardCard(0).within(() => {
      H.chartGridLines().should("exist"); // wait for charts to load to prevent flakiness
    });

    // Click on both series of the first chart
    // Series 1
    H.showUnderlyingQuestion(0, ORDERS_COUNT_BY_CREATED_AT.name);
    cy.get("@ordersCountByCreatedAtQuestionId").then((id) =>
      cy.url().should("contain", `${id}-orders-by-created-at-month`),
    );
    cy.findByLabelText("Back to Test Dashboard").click();
    // Series 2
    H.showUnderlyingQuestion(0, PRODUCTS_COUNT_BY_CREATED_AT.name);
    cy.get("@productsCountByCreatedAtQuestionId").then((id) =>
      cy.url().should("contain", `${id}-products-by-created-at-month`),
    );
    cy.findByLabelText("Back to Test Dashboard").click();

    // Click on the third chart (a pie with a single series)
    H.clickOnCardTitle(2);
    cy.get("@productsCountByCategoryQuestionId").then((id) =>
      cy.url().should("contain", `${id}-products-by-category`),
    );
    cy.findByLabelText("Back to Test Dashboard").click();

    // Click on the fifth chart (a funnel)
    H.showUnderlyingQuestion(4, STEP_COLUMN_CARD.name);
    cy.get("@stepColumnQuestionId").then((id) =>
      cy.url().should("contain", `${id}-step-column`),
    );
    cy.findByLabelText("Back to Test Dashboard").click();
  });

  it("should open underlying questions in the ellipsis menu if the card has no title", () => {
    createDashboardWithVisualizerDashcards();

    // This card HAS a title, so it should NOT have the "View question(s)" option
    H.getDashboardCard(0).realHover();
    H.getDashboardCardMenu(0).click();
    H.popover().findByText("View question(s)").should("not.exist");

    // This card has NO title, so it SHOULD have the "View question(s)" option
    H.editDashboard();
    H.showDashcardVisualizerModal(2);
    H.modal().within(() => {
      cy.findByTestId("visualizer-title").clear().blur();
    });
    H.saveDashcardVisualizerModal();
    cy.wait(DASHCARD_QUERY_WAIT_TIME);
    H.saveDashboard({ waitMs: DASHBOARD_SAVE_WAIT_TIME });

    H.getDashboardCard(2).realHover();
    H.getDashboardCardMenu(2).click();
    H.popover().within(() => {
      cy.findByText("View question(s)").should("exist");
      cy.findByText("View question(s)").realHover();
    });

    cy.findByTestId("dashcard-menu-open-underlying-question").within(() => {
      cy.findByText(PRODUCTS_COUNT_BY_CATEGORY.name).click();
    });

    cy.get("@productsCountByCategoryQuestionId").then((id) =>
      cy.url().should("contain", `${id}-products-by-category`),
    );
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
    H.getDashboardCard(0).findByText("Created At: Month").should("exist"); // wait for query rerun
    H.assertDashboardCardTitle(0, "Renamed chart");

    // Rename the third card and check
    // PRODUCTS_COUNT_BY_CREATED_AT.name -> "Another chart"
    H.showDashcardVisualizerModal(3, {
      isVisualizerCard: false,
    });
    H.modal().within(() => {
      cy.findByDisplayValue(PRODUCTS_COUNT_BY_CREATED_AT.name)
        .clear()
        .type("Another chart")
        .blur();
    });
    H.saveDashcardVisualizerModal();
    H.getDashboardCard(3).findByText("Created At: Month").should("exist"); // wait for query rerun
    H.assertDashboardCardTitle(3, "Another chart");

    // Clear the second card title
    // My category chart -> ""
    H.showDashcardVisualizerModal(1);
    H.modal().within(() => {
      cy.findByTestId("visualizer-title").clear().blur();
    });
    H.saveDashcardVisualizerModal();
    H.getDashboardCard(1).findByText("Product → Category").should("exist"); // wait for query rerun
    H.assertDashboardCardTitle(1, "");

    // Save the dashboard
    H.saveDashboard({ waitMs: DASHBOARD_SAVE_WAIT_TIME });

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

  it("should allow adding description to a visualizer dashcard (metabase#61457)", () => {
    createDashboardWithVisualizerDashcards();
    H.editDashboard();

    H.showDashcardVisualizerModal(0);
    H.modal().within(() => {
      cy.findByText("Settings").click();
      cy.findByTestId("card.description").should("have.value", "");
      cy.findByTestId("card.description").type("My description").blur();
    });

    H.saveDashcardVisualizerModal();
    H.saveDashboard();

    H.getDashboardCard(0)
      .realHover()
      .within(() => {
        cy.icon("info").realHover();
      });
    H.tooltip().findByText("My description").should("exist");
  });

  it("should allow drilling into the underlying question by clicking on the title (metabase#64340)", () => {
    H.createQuestion(ORDERS_COUNT_BY_CREATED_AT, {
      wrapId: true,
      idAlias: "questionId",
    });

    H.createDashboard().then(({ body: { id: dashboardId } }) => {
      cy.get("@questionId").then((questionId) => {
        H.addQuestionToDashboard({
          dashboardId,
          cardId: questionId as any,
        });
        H.visitDashboard(dashboardId);
      });
    });

    H.editDashboard();
    H.getDashboardCard(0)
      .realHover({ scrollBehavior: "bottom" })
      .findByLabelText("Visualize another way")
      .click();

    H.modal().within(() => {
      H.selectVisualization("bar");
    });
    H.saveDashcardVisualizerModal();
    H.saveDashboard();
    H.getDashboardCard(0).within(() => {
      cy.findByText("Orders by Created At (Month)").click();
    });

    cy.url().should("match", /\/question\/\d+/);
  });

  it("should propagate original card title and description to visualizer cards (metabase#63863)", () => {
    const questionWithDescription = {
      ...ORDERS_COUNT_BY_CREATED_AT,
      name: "Original Question Title",
      description: "Original question description",
    };

    H.createQuestion(questionWithDescription, {
      wrapId: true,
      idAlias: "questionWithDescriptionId",
    });

    H.createDashboard().then(({ body: { id: dashboardId } }) => {
      cy.get("@questionWithDescriptionId").then((questionId) => {
        H.addQuestionToDashboard({
          dashboardId,
          cardId: questionId as any,
        });
        H.visitDashboard(dashboardId);
      });
    });

    H.getDashboardCard(0).within(() => {
      cy.findByText("Original Question Title").should("exist");
    });

    H.getDashboardCard(0)
      .realHover()
      .within(() => {
        cy.icon("info").realHover();
      });
    H.tooltip().findByText("Original question description").should("exist");

    H.editDashboard();
    H.getDashboardCard(0)
      .realHover({ scrollBehavior: "bottom" })
      .findByLabelText("Visualize another way")
      .click();

    H.modal().within(() => {
      cy.findByDisplayValue("Original Question Title").should("exist");
      cy.findByText("Settings").click();
      cy.findByTestId("card.description").should(
        "have.value",
        "Original question description",
      );

      H.selectVisualization("bar");
    });

    H.saveDashcardVisualizerModal();

    H.saveDashboard({ waitMs: DASHBOARD_SAVE_WAIT_TIME });

    H.getDashboardCard(0).within(() => {
      cy.findByText("Original Question Title").should("exist");
    });

    H.getDashboardCard(0)
      .realHover()
      .within(() => {
        cy.icon("info").realHover();
      });
    H.tooltip().findByText("Original question description").should("exist");

    H.editDashboard();

    H.showDashcardVisualizerModal(0);
    H.modal().within(() => {
      cy.findByDisplayValue("Original Question Title").should("exist");
      cy.findByText("Settings").click();
      cy.findByTestId("card.description").should(
        "have.value",
        "Original question description",
      );

      cy.findByTestId("visualizer-title").clear().type("Updated Title").blur();
      cy.findByTestId("card.description")
        .clear()
        .type("Updated description")
        .blur();
    });

    H.saveDashcardVisualizerModal();

    H.saveDashboard({ waitMs: DASHBOARD_SAVE_WAIT_TIME });

    H.getDashboardCard(0).within(() => {
      cy.findByText("Updated Title").should("exist");
    });

    H.getDashboardCard(0)
      .realHover()
      .within(() => {
        cy.icon("info").realHover();
      });
    H.tooltip().findByText("Updated description").should("exist");
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
      cy.findByLabelText("Undo").as("undoButton");
      cy.findByLabelText("Redo").as("redoButton");

      cy.get("@undoButton").should("be.disabled");
      cy.get("@redoButton").should("be.disabled");

      H.switchToAddMoreData();
      H.selectDataset(PRODUCTS_COUNT_BY_CREATED_AT.name);
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

    cy.wait(DASHCARD_QUERY_WAIT_TIME);

    // Ensure history set is reset
    H.showDashcardVisualizerModal(1);

    H.modal().within(() => {
      cy.get("@undoButton").should("be.disabled");
      cy.get("@redoButton").should("be.disabled");
      cy.findByTestId("chartsettings-sidebar").should("not.be.visible");
    });
  });

  it("should replace a dataset without remembering removing the current ones (metabase#57897)", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);

    H.editDashboard();
    H.openQuestionsSidebar();
    H.clickVisualizeAnotherWay(ORDERS_COUNT_BY_CREATED_AT.name);

    H.modal().within(() => {
      cy.findByLabelText("Undo").as("undoButton");
      cy.findByLabelText("Redo").as("redoButton");

      cy.get("@undoButton").should("be.disabled");
      cy.get("@redoButton").should("be.disabled");

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

    H.saveDashcardVisualizerModal({ mode: "create" });
    H.getDashboardCard(0).within(() => {
      cy.wait("@cardQuery");
      cy.findByText(ORDERS_COUNT_BY_CREATED_AT.name).should("exist");
      cy.findByText("Created At: Month").should("exist");
    });
    H.saveDashboard({ waitMs: DASHBOARD_SAVE_WAIT_TIME });

    H.editDashboard();
    H.showDashcardVisualizerModal(0);
    H.modal().within(() => {
      H.switchToAddMoreData();
      H.selectDataset(PRODUCTS_COUNT_BY_CREATED_AT.name);
      H.assertWellItemsCount({ vertical: 2 });
    });
    H.saveDashcardVisualizerModal();
    H.getDashboardCard(0).within(() => {
      cy.wait("@cardQuery");
      cy.wait("@cardQuery");
      // Dashcard title, legend and y-axis label
      cy.findAllByText(ORDERS_COUNT_BY_CREATED_AT.name).should(
        "have.length",
        3,
      );
      // Legend and y-axis label
      cy.findAllByText(PRODUCTS_COUNT_BY_CREATED_AT.name).should(
        "have.length",
        2,
      );
      cy.findByText("Created At: Month").should("exist");
    });
    H.saveDashboard();

    // Making sure the card renders
    H.getDashboardCard(0).within(() => {
      cy.findAllByText(ORDERS_COUNT_BY_CREATED_AT.name).should(
        "have.length",
        3,
      );
      cy.findAllByText(PRODUCTS_COUNT_BY_CREATED_AT.name).should(
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
        H.selectDataset("Products by Created At (Month)");
        H.assertWellItems({
          vertical: ["Count", "Count (Products by Created At (Month))"],
        });
      });
      H.saveDashcardVisualizerModal({ mode: "create" });
      H.saveDashboard();

      cy.intercept("GET", `/api/dashboard/${dashboardId}*`).as("dashboardLoad");
      cy.reload();

      cy.wait("@dashboardLoad").then(({ response }) => {
        const visualizerSettings =
          response?.body?.dashcards[0]?.visualization_settings?.visualization
            ?.settings;

        expect(Object.keys(visualizerSettings)).to.have.length(2);
        expect(visualizerSettings).to.eql({
          "graph.dimensions": ["COLUMN_1", "COLUMN_4"],
          "graph.metrics": ["COLUMN_2", "COLUMN_3"],
        });
      });
    });
  });

  it("should allow editing a dashcard when added series are broken (metabase#22265, VIZ-676)", () => {
    const baseQuestion = {
      name: "Base question",
      display: "scalar" as const,
      native: {
        query: "SELECT 1",
      },
    };

    const invalidQuestion = {
      name: "Invalid question",
      display: "scalar" as const,
      native: {
        query: "SELECT 1",
      },
    };

    H.createNativeQuestion(invalidQuestion, {
      wrapId: true,
      idAlias: "invalidQuestionId",
    });

    H.createNativeQuestionAndDashboard({ questionDetails: baseQuestion }).then(
      ({ body: { id, card_id, dashboard_id } }) => {
        cy.request("PUT", `/api/dashboard/${dashboard_id}`, {
          dashcards: [
            {
              id,
              card_id,
              row: 0,
              col: 0,
              size_x: 16,
              size_y: 10,
            },
          ],
        });

        cy.wrap(dashboard_id).as("dashboardId");
        H.visitDashboard(dashboard_id);
      },
    );

    H.editDashboard();
    H.getDashboardCard(0)
      .realHover({ scrollBehavior: "bottom" })
      .findByLabelText("Visualize another way")
      .click();

    cy.intercept("GET", "/api/card/*/query_metadata").as("queryMetadata");

    H.modal().within(() => {
      H.switchToAddMoreData();
      H.selectDataset(invalidQuestion.name);
      cy.findByTestId("funnel-chart").should("contain", "Invalid question");
      cy.button("Save").click();
    });

    cy.get("@queryMetadata.all").should("have.length", 2);
    H.getDashboardCard().should("contain", "Invalid question");

    H.saveDashboard();

    cy.log("Update 2nd question so that it's broken");
    cy.get("@invalidQuestionId").then((invalidQuestionId) => {
      cy.request("PUT", `/api/card/${invalidQuestionId}`, {
        dataset_query: {
          type: "native",
          database: SAMPLE_DB_ID,
          native: {
            query: "SELECT --2",
            "template-tags": {},
          },
        },
      });
    });

    H.visitDashboard("@dashboardId");
    H.editDashboard();

    H.getDashboardCard(0).within(() => {
      // dashcard title + the funnel itself
      cy.findAllByText(baseQuestion.name).should("have.length", 2);
      cy.findByText(invalidQuestion.name).should("exist");
      cy.findByText("1").should("exist");
    });

    H.getDashboardCard(0)
      .realHover({ scrollBehavior: "bottom" })
      .findByLabelText("Edit visualization")
      .click();
    H.modal().within(() => {
      H.dataImporter().findByText(baseQuestion.name).should("exist");
      H.dataImporter().findByText(invalidQuestion.name).should("exist");
    });
  });

  describe("public sharing and embedding", () => {
    function ensureVisualizerCardsAreRendered() {
      // Checks a cartesian chart has an axis name
      H.getDashboardCard(0).within(() => {
        H.echartsContainer()
          .findByText(ORDERS_COUNT_BY_CREATED_AT.name)
          .should("be.visible");
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

  it("show a message when there are no search results", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();
    H.openQuestionsSidebar();
    H.clickVisualizeAnotherWay(ORDERS_COUNT_BY_CREATED_AT.name);

    H.modal().within(() => {
      cy.findByText("Add more data").click();
      cy.findByPlaceholderText("Search for something").type("non-existing");

      cy.findByText("No compatible results").should("exist");
    });
  });

  it("should reset a dataset", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();
    H.openQuestionsSidebar();
    H.clickVisualizeAnotherWay(ORDERS_COUNT_BY_CREATED_AT.name);

    H.modal().within(() => {
      cy.findByText("Add to dashboard").click();
    });

    cy.wait("@cardQuery");

    H.getDashboardCard(1).within(() => {
      cy.findByText(ORDERS_COUNT_BY_CREATED_AT.name).should("exist");
      cy.findByText("Created At: Month").should("exist");
    });

    H.showDashcardVisualizerModal(1);
    H.modal().within(() => {
      H.selectVisualization("pie");
      H.assertWellItems({
        pieMetric: ["Count"],
        pieDimensions: ["Created At: Month"],
      });
    });
    H.saveDashcardVisualizerModal();
    H.saveDashboard();

    H.editDashboard();
    H.showDashcardVisualizerModal(1);

    H.modal().within(() => {
      H.resetDataSourceButton(ORDERS_COUNT_BY_CREATED_AT.name)
        .should("be.enabled")
        .click();

      H.assertWellItems({
        vertical: ["Count"],
        horizontal: ["Created At: Month"],
      });

      H.resetDataSourceButton(ORDERS_COUNT_BY_CREATED_AT.name).should(
        "be.disabled",
      );
    });
  });

  it("should allow viewing the table preview (metabase#69038)", () => {
    createDashboardWithVisualizerDashcards();
    H.editDashboard();

    H.showDashcardVisualizerModal(0);

    cy.findByTestId("visualizer-view-as-table-button").click();

    cy.findByTestId("visualizer-tabular-preview-modal").within(() => {
      cy.findByText("Count").should("exist");
    });
  });
});
