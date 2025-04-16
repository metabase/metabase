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

describe("scenarios > dashboard > visualizer", () => {
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

    H.findDashCardAction(H.getDashboardCard(0), "Edit visualization").click();
    H.modal().within(() => {
      cy.findByDisplayValue("My chart")
        .type("{selectall}{del}Renamed chart")
        .blur();
      cy.button("Save").click();
    });
    H.getDashboardCard(0).within(() => {
      cy.findByText("Renamed chart").should("exist");
      cy.findByText("My chart").should("not.exist");
    });

    H.showDashcardVisualizerModalSettings(3);
    H.modal().within(() => {
      cy.findByDisplayValue(PRODUCTS_COUNT_BY_CREATED_AT.name)
        .type("{selectall}{del}Another chart")
        .blur();
      cy.button("Save").click();
    });
    H.getDashboardCard(3).within(() => {
      cy.findByText("Another chart").should("exist");
      cy.findByText(PRODUCTS_COUNT_BY_CREATED_AT.name).should("not.exist");
    });

    H.saveDashboard();

    H.getDashboardCard(0).within(() => {
      cy.findByText("Renamed chart").should("exist");
      cy.findByText("My chart").should("not.exist");
    });
    H.getDashboardCard(3).within(() => {
      cy.findByText("Another chart").should("exist");
      cy.findByText(PRODUCTS_COUNT_BY_CREATED_AT.name).should("not.exist");
    });
  });

  it("should handle drill through", () => {
    createDashboardWithVisualizerDashcards();

    const ORDERS_SERIES_COLOR = "#88BF4D";
    const PRODUCTS_SERIES_COLOR = "#A989C5";

    // 1. Cartesian chart, timeseries breakout
    const SEP_2022_POINT_INDEX = 5;

    H.getDashboardCard(0).within(() =>
      // eslint-disable-next-line no-unsafe-element-filtering
      H.cartesianChartCircleWithColor(PRODUCTS_SERIES_COLOR)
        .eq(SEP_2022_POINT_INDEX)
        .click(),
    );
    H.clickActionsPopover().findByText("See these Products").click();
    cy.wait("@dataset");

    H.queryBuilderFiltersPanel().children().should("have.length", 1);
    H.queryBuilderFiltersPanel().findByText("Created At is Sep 1–30, 2022");
    H.assertQueryBuilderRowCount(9);
    H.tableInteractiveHeader().findByText("Price"); // ensure we're on the Products table

    H.queryBuilderHeader().findByLabelText("Back to Test Dashboard").click();

    H.getDashboardCard(0).within(() => {
      // eslint-disable-next-line no-unsafe-element-filtering
      H.cartesianChartCircleWithColor(ORDERS_SERIES_COLOR)
        .eq(SEP_2022_POINT_INDEX)
        .click();
    });

    H.clickActionsPopover().findByText("Break out by…").click();
    H.clickActionsPopover().findByText("Category").click();
    H.clickActionsPopover().findByText("Source").click();
    cy.wait("@dataset");

    H.queryBuilderFiltersPanel().children().should("have.length", 1);
    H.queryBuilderFiltersPanel().findByText("Created At is Sep 1–30, 2022");
    H.assertQueryBuilderRowCount(5);
    H.echartsContainer().within(() => {
      cy.findByText("Affiliate").should("exist");
      cy.findByText("Organic").should("exist");
      cy.findByText("Twitter").should("exist");
    });

    H.queryBuilderHeader().findByLabelText("Back to Test Dashboard").click();

    H.getDashboardCard(0).within(() => H.chartLegendItem("Count").click());
    cy.wait("@cardQuery");
    H.queryBuilderHeader()
      .findByText(ORDERS_COUNT_BY_CREATED_AT.name)
      .should("exist");
    H.assertQueryBuilderRowCount(49);

    H.queryBuilderHeader().findByLabelText("Back to Test Dashboard").click();

    H.getDashboardCard(0).within(() =>
      H.chartLegendItem(`Count (${PRODUCTS_COUNT_BY_CREATED_AT.name})`).click(),
    );
    cy.wait("@cardQuery");
    H.queryBuilderHeader()
      .findByText(PRODUCTS_COUNT_BY_CREATED_AT.name)
      .should("exist");
    H.assertQueryBuilderRowCount(37);

    H.queryBuilderHeader().findByLabelText("Back to Test Dashboard").click();

    // 2. Cartesian chart, category breakout
    H.getDashboardCard(1).within(() =>
      H.chartPathWithFillColor(ORDERS_SERIES_COLOR).eq(1).click(),
    );
    H.clickActionsPopover().findByText("See these Orders").click();
    cy.wait("@dataset");

    H.queryBuilderFiltersPanel().children().should("have.length", 1);
    H.queryBuilderFiltersPanel().findByText("Product → Category is Gadget");
    H.tableInteractiveHeader().findByText("Subtotal"); // ensure we're on the Orders table

    H.queryBuilderHeader().findByLabelText("Back to Test Dashboard").click();

    H.getDashboardCard(1).within(() =>
      H.chartPathWithFillColor(PRODUCTS_SERIES_COLOR).eq(0).click(),
    );
    H.clickActionsPopover().button(">").click();
    cy.wait("@dataset");

    H.queryBuilderFiltersPanel().children().should("have.length", 1);
    H.queryBuilderFiltersPanel().findByText("Count is greater than 42");
    H.assertQueryBuilderRowCount(3);

    H.queryBuilderHeader().findByLabelText("Back to Test Dashboard").click();

    // 3. Pie chart
    H.getDashboardCard(2).within(() =>
      H.chartPathWithFillColor("#F2A86F").click(),
    );
    H.clickActionsPopover().findByText("See these Products").click();
    cy.wait("@dataset");

    H.queryBuilderFiltersPanel().children().should("have.length", 1);
    H.queryBuilderFiltersPanel().findByText("Category is Widget");
    H.tableInteractiveHeader().findByText("Price"); // ensure we're on the Products table
    H.assertQueryBuilderRowCount(54);

    H.queryBuilderHeader().findByLabelText("Back to Test Dashboard").click();

    // 4. Funnel (regular)
    H.getDashboardCard(4).get("polygon").first().click();
    cy.wait(200); // HACK: wait for popover to appear
    H.clickActionsPopover().button("=").click();
    cy.wait("@dataset");

    H.queryBuilderFiltersPanel().children().should("have.length", 1);
    H.queryBuilderFiltersPanel().findByText("Views is equal to 600");
    H.tableInteractiveHeader().findByText("Views").should("exist");
    H.assertQueryBuilderRowCount(1);

    H.queryBuilderHeader().findByLabelText("Back to Test Dashboard").click();

    // 5. Funnel (scalar)
    H.getDashboardCard(5).get("polygon").first().click();
    cy.wait(200); // HACK: wait for popover to appear
    H.clickActionsPopover().button("=").click();
    cy.wait("@dataset");

    H.queryBuilderFiltersPanel().children().should("have.length", 1);
    H.queryBuilderFiltersPanel().findByText("Views is equal to 600");
    H.tableInteractiveHeader().findByText("Views").should("exist");
    H.assertQueryBuilderRowCount(1);
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

  describe("cartesian charts", () => {
    it("should allow to change viz settings", () => {
      createDashboardWithVisualizerDashcards();
      H.editDashboard();

      H.showDashcardVisualizerModalSettings(0);

      H.modal().within(() => {
        H.goalLine().should("not.exist");
        cy.findByTestId("chartsettings-sidebar")
          .findByText("Goal line")
          .click();
        H.goalLine().should("exist");

        // Ensure the chart legend contains original series name
        H.chartLegend().within(() => {
          cy.findByText("Count (Products by Created At (Month))").should(
            "exist",
          );
        });

        // Edit series settings
        cy.findAllByTestId("series-settings").within(() => {
          // Update series name
          cy.findAllByTestId("series-name-input")
            .eq(1)
            .type("{selectall}{del}Series B")
            .blur();

          // Update series display type
          cy.icon("chevrondown").eq(1).click();
          cy.icon("bar").click();

          // Update series color
          cy.findAllByTestId("color-selector-button").eq(1).click();
        });
      });

      H.popover().findByLabelText("#DCDFE0").click();

      const assertUpdatedVizSettingsApplied = () => {
        H.goalLine().should("exist");
        // Ensure the chart legend contains renamed series
        H.chartLegend().within(() => {
          cy.findByText("Series B").should("exist");
          cy.findByText("Count (Products by Created At (Month))").should(
            "not.exist",
          );
        });
        H.chartPathWithFillColor("#DCDFE0");
      };

      H.modal().within(() => {
        assertUpdatedVizSettingsApplied();
      });

      H.saveDashcardVisualizerModalSettings();

      H.getDashboardCard(0).within(() => {
        assertUpdatedVizSettingsApplied();
      });
    });

    describe("timeseries breakout", () => {
      it("should automatically use new columns whenever possible", () => {
        const Q1_NAME = ORDERS_COUNT_BY_CREATED_AT.name;
        const Q2_NAME = PRODUCTS_COUNT_BY_CREATED_AT.name;

        H.visitDashboard(ORDERS_DASHBOARD_ID);
        H.editDashboard();
        H.openQuestionsSidebar();

        H.clickVisualizeAnotherWay(Q1_NAME);

        H.modal().within(() => {
          H.switchToAddMoreData();
          H.addDataset(Q2_NAME);
          H.switchToColumnsList();

          H.verticalWell().within(() => {
            cy.findByText("Count").should("exist");
          });
          H.horizontalWell().findByText("Created At: Month").should("exist");

          H.ensureDisplayIsSelected("line");

          H.echartsContainer().within(() => {
            // x-axis labels
            cy.findByText("January 2023").should("exist");
            cy.findByText("January 2026").should("exist");
            // y-axis labels
            cy.findByText("600").should("exist");
            cy.findByText("10").should("exist");
          });

          H.dataSource(Q1_NAME).should("exist");
          H.dataSource(Q2_NAME).should("exist");
          H.assertDataSourceColumnSelected(Q1_NAME, "Count");
          H.assertDataSourceColumnSelected(Q1_NAME, "Created At: Month");
          H.assertDataSourceColumnSelected(Q2_NAME, "Count");
          H.assertDataSourceColumnSelected(Q2_NAME, "Created At: Month");
          H.chartLegendItems().should("have.length", 2);

          // Remove 2nd count column from the data manager
          H.deselectColumnFromColumnsList(Q2_NAME, "Count");
          H.assertDataSourceColumnSelected(Q2_NAME, "Count", false);
          H.verticalWell().findByText(`Count (${Q2_NAME})`).should("not.exist");
          // legend is visible only when there are multiple series
          H.chartLegend().should("not.exist");

          // Add back 2nd count column from the data manager
          H.dataSourceColumn(Q2_NAME, "Count").click();
          H.assertDataSourceColumnSelected(Q2_NAME, "Count");
          H.verticalWell().findByText(`Count (${Q2_NAME})`).should("exist");
          H.chartLegendItems().should("have.length", 2);

          // Remove all count columns from the well
          // TODO maybe put that into a function
          H.verticalWell().within(() => {
            cy.findAllByTestId("well-item")
              .first()
              .findByLabelText("Remove")
              .click();
            cy.findByTestId("well-item").findByLabelText("Remove").click();
          });

          H.assertDataSourceColumnSelected(Q1_NAME, "Count", false);
          H.assertDataSourceColumnSelected(Q2_NAME, "Count", false);
          H.chartLegend().should("not.exist");

          // Remove all "created at" columns from the well
          H.horizontalWell()
            .findByTestId("well-item")
            .findByLabelText("Remove")
            .click();
          H.assertDataSourceColumnSelected(Q1_NAME, "Created At: Month", false);
          H.assertDataSourceColumnSelected(Q2_NAME, "Created At: Month", false);
          H.chartLegend().should("not.exist");

          //   // Add all columns back
          H.dataSourceColumn(Q1_NAME, "Count").click();
          H.dataSourceColumn(Q1_NAME, "Created At: Month").click();
          H.dataSourceColumn(Q2_NAME, "Count").click();
          H.dataSourceColumn(Q2_NAME, "Created At: Month").click();
          H.verticalWell()
            .findAllByTestId("well-item")
            .should("have.length", 2);
          H.horizontalWell()
            .findAllByTestId("well-item")
            .should("have.length", 1);
          H.chartLegendItems().should("have.length", 2);

          // Remove 2nd data source
          H.removeDataSource(Q2_NAME);
          H.dataImporter().within(() => {
            cy.findByText(Q2_NAME).should("not.exist");
            cy.findAllByText("Count").should("have.length", 1);
            cy.findAllByText("Created At: Month").should("have.length", 1);
          });
          H.verticalWell()
            .findAllByTestId("well-item")
            .should("have.length", 1);
          H.horizontalWell()
            .findAllByTestId("well-item")
            .should("have.length", 1);
          H.chartLegend().should("not.exist");
        });
      });
    });

    describe("category breakout", () => {
      it("should automatically use new columns whenever possible", () => {
        const Q1_NAME = ORDERS_COUNT_BY_PRODUCT_CATEGORY.name;
        const Q2_NAME = PRODUCTS_COUNT_BY_CATEGORY.name;

        H.visitDashboard(ORDERS_DASHBOARD_ID);
        H.editDashboard();
        H.openQuestionsSidebar();

        H.clickVisualizeAnotherWay(Q1_NAME);

        H.modal().within(() => {
          cy.button("Add more data").click();
          H.addDataset(Q2_NAME);
          cy.button("Done").click();

          H.verticalWell().within(() => {
            cy.findByText("Count").should("exist");
            cy.findByText(`Count (${Q2_NAME})`).should("exist");
          });
          H.horizontalWell().findByText("Product → Category").should("exist");

          cy.findByDisplayValue("bar").should("be.checked");

          H.echartsContainer().within(() => {
            // x-axis labels
            cy.findByText("Doohickey").should("exist");
            cy.findByText("Widget").should("exist");
            // y-axis labels
            cy.findByText("6,000").should("exist");
            cy.findByText("1,000").should("exist");
          });

          H.dataSource(Q1_NAME).should("exist");
          H.dataSource(Q2_NAME).should("exist");
          H.assertDataSourceColumnSelected(Q1_NAME, "Count");
          H.assertDataSourceColumnSelected(Q1_NAME, "Product → Category");
          H.assertDataSourceColumnSelected(Q2_NAME, "Count");
          H.assertDataSourceColumnSelected(Q2_NAME, "Category");
          H.chartLegendItems().should("have.length", 2);

          // Remove 2nd count column from the data manager
          H.dataSourceColumn(Q2_NAME, "Count")
            .findByLabelText("Remove")
            .click();
          H.assertDataSourceColumnSelected(Q2_NAME, "Count", false);
          H.verticalWell().findByText(`Count (${Q2_NAME})`).should("not.exist");
          // legend is visible only when there are multiple series
          H.chartLegend().should("not.exist");

          // Add 2nd count column from the data manager
          H.dataSourceColumn(Q2_NAME, "Count").click();
          H.assertDataSourceColumnSelected(Q2_NAME, "Count");
          H.verticalWell().findByText(`Count (${Q2_NAME})`).should("exist");
          H.chartLegendItems().should("have.length", 2);

          // Remove all count columns from the well
          H.verticalWell().within(() => {
            cy.findAllByTestId("well-item")
              .first()
              .findByLabelText("Remove")
              .click();
            cy.findByTestId("well-item").findByLabelText("Remove").click();
          });
          H.assertDataSourceColumnSelected(Q1_NAME, "Count", false);
          H.assertDataSourceColumnSelected(Q2_NAME, "Count", false);
          H.chartLegend().should("not.exist");

          // Remove all "category" columns from the well
          H.horizontalWell()
            .findByTestId("well-item")
            .findByLabelText("Remove")
            .click();
          H.assertDataSourceColumnSelected(
            Q1_NAME,
            "Product → Category",
            false,
          );
          H.assertDataSourceColumnSelected(Q2_NAME, "Category", false);
          H.chartLegend().should("not.exist");

          // Add all columns back
          H.dataSourceColumn(Q1_NAME, "Count").click();
          H.dataSourceColumn(Q1_NAME, "Product → Category").click();
          H.dataSourceColumn(Q2_NAME, "Count").click();
          H.dataSourceColumn(Q2_NAME, "Category").click();
          H.verticalWell()
            .findAllByTestId("well-item")
            .should("have.length", 2);
          H.horizontalWell()
            .findAllByTestId("well-item")
            .should("have.length", 1);
          H.chartLegendItems().should("have.length", 2);

          // Remove 2nd data source
          H.removeDataSource(Q2_NAME);
          H.dataImporter().within(() => {
            cy.findByText(Q2_NAME).should("not.exist");
            cy.findAllByText("Count").should("have.length", 1);
            cy.findAllByText("Category").should("not.exist");
          });
          H.verticalWell()
            .findAllByTestId("well-item")
            .should("have.length", 1);
          H.horizontalWell()
            .findAllByTestId("well-item")
            .should("have.length", 1);
          H.chartLegend().should("not.exist");
        });
      });
    });
  });

  describe("pie charts", () => {
    it("should allow to change viz settings", () => {
      createDashboardWithVisualizerDashcards();
      H.editDashboard();

      // Pie chart
      H.showDashcardVisualizerModalSettings(2);
      H.modal().within(() => {
        cy.findByText("Display").click();

        H.echartsContainer().within(() => {
          cy.findByText("200").should("exist");
          cy.findByText("TOTAL").should("exist");
        });
        cy.findByTestId("chartsettings-sidebar")
          .findByText("Show total")
          .click();
        H.echartsContainer().within(() => {
          cy.findByText("200").should("not.exist");
          cy.findByText("TOTAL").should("not.exist");
        });

        cy.button("Save").click();
      });
    });
  });

  describe("funnels", () => {
    it("should build a funnel", () => {
      H.visitDashboard(ORDERS_DASHBOARD_ID);
      H.editDashboard();

      H.openQuestionsSidebar();
      H.clickVisualizeAnotherWay(STEP_COLUMN_CARD.name);

      H.modal().findByTestId("viz-picker-menu").click();
      H.popover().findByText("Funnel").click();

      H.modal().within(() => {
        cy.button("Add more data").click();
        H.addDataset(VIEWS_COLUMN_CARD.name);
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
        H.assertDataSourceColumnSelected(
          VIEWS_COLUMN_CARD.name,
          "Views",
          false,
        );
        H.verticalWell().findAllByTestId("well-item").should("have.length", 0);
        H.horizontalWell()
          .findAllByTestId("well-item")
          .should("have.length", 4);

        // Remove the dimension column from the well
        H.horizontalWell()
          .findAllByTestId("well-item")
          .first()
          .findByLabelText("Remove")
          .click();
        H.assertDataSourceColumnSelected(STEP_COLUMN_CARD.name, "Step", false);
        H.verticalWell().findAllByTestId("well-item").should("have.length", 0);
        H.horizontalWell()
          .findAllByTestId("well-item")
          .should("have.length", 0);

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
        H.horizontalWell()
          .findAllByTestId("well-item")
          .should("have.length", 4);
      });
    });

    it("should build a funnel of several scalar cards", () => {
      const {
        LANDING_PAGE_VIEWS,
        CHECKOUT_PAGE_VIEWS,
        PAYMENT_DONE_PAGE_VIEWS,
      } = SCALAR_CARD;

      H.visitDashboard(ORDERS_DASHBOARD_ID);
      H.editDashboard();

      cy.findByLabelText("Add section").click();
      H.menu().findByLabelText("KPI grid").click();
      H.getDashboardCard(2).button("Visualize").click();

      H.modal().within(() => {
        cy.findByText("Funnel").click();

        H.switchToAddMoreData();
        H.selectDataset(LANDING_PAGE_VIEWS.name);
        H.addDataset(CHECKOUT_PAGE_VIEWS.name);
        H.addDataset(PAYMENT_DONE_PAGE_VIEWS.name);
        H.switchToColumnsList();

        H.assertDataSourceColumnSelected(LANDING_PAGE_VIEWS.name, "views");
        H.assertDataSourceColumnSelected(CHECKOUT_PAGE_VIEWS.name, "views");
        H.assertDataSourceColumnSelected(PAYMENT_DONE_PAGE_VIEWS.name, "views");

        H.verticalWell().within(() => {
          cy.findByText("METRIC").should("exist");
          cy.findAllByTestId("well-item").should("have.length", 1);
        });
        H.horizontalWell().within(() => {
          cy.findByText("DIMENSION").should("exist");
          cy.findByText(LANDING_PAGE_VIEWS.name).should("exist");
          cy.findByText(CHECKOUT_PAGE_VIEWS.name).should("exist");
          cy.findByText(PAYMENT_DONE_PAGE_VIEWS.name).should("exist");
          cy.findAllByTestId("well-item").should("have.length", 4);
        });

        // Remove a column from the data manager
        H.deselectColumnFromColumnsList(CHECKOUT_PAGE_VIEWS.name, "views");
        H.assertDataSourceColumnSelected(
          CHECKOUT_PAGE_VIEWS.name,
          "views",
          false,
        );
        H.verticalWell().within(() => {
          cy.findByText("METRIC").should("exist");
          cy.findAllByTestId("well-item").should("have.length", 1);
        });
        H.horizontalWell().within(() => {
          cy.findByText("DIMENSION").should("exist");
          cy.findAllByTestId("well-item").should("have.length", 3);
        });

        // Add a column back
        H.selectColumnFromColumnsList(CHECKOUT_PAGE_VIEWS.name, "views");
        H.assertDataSourceColumnSelected(CHECKOUT_PAGE_VIEWS.name, "views");
        H.verticalWell().within(() => {
          cy.findByText("METRIC").should("exist");
          cy.findAllByTestId("well-item").should("have.length", 1);
        });
        H.horizontalWell().within(() => {
          cy.findByText("DIMENSION").should("exist");
          cy.findAllByTestId("well-item").should("have.length", 4);
        });

        // Remove the metric column from the well
        H.verticalWell()
          .findByTestId("well-item")
          .findByLabelText("Remove")
          .click();

        H.assertDataSourceColumnSelected(
          LANDING_PAGE_VIEWS.name,
          "views",
          false,
        );
        H.assertDataSourceColumnSelected(
          CHECKOUT_PAGE_VIEWS.name,
          "views",
          false,
        );
        H.assertDataSourceColumnSelected(
          PAYMENT_DONE_PAGE_VIEWS.name,
          "views",
          false,
        );

        H.verticalWell().findAllByTestId("well-item").should("have.length", 0);
        H.horizontalWell()
          .findAllByTestId("well-item")
          .should("have.length", 0);

        // Rebuild the funnel
        H.selectColumnFromColumnsList(LANDING_PAGE_VIEWS.name, "views");
        H.selectColumnFromColumnsList(CHECKOUT_PAGE_VIEWS.name, "views");
        H.selectColumnFromColumnsList(PAYMENT_DONE_PAGE_VIEWS.name, "views");

        H.assertDataSourceColumnSelected(LANDING_PAGE_VIEWS.name, "views");
        H.assertDataSourceColumnSelected(CHECKOUT_PAGE_VIEWS.name, "views");
        H.assertDataSourceColumnSelected(PAYMENT_DONE_PAGE_VIEWS.name, "views");

        H.verticalWell().within(() => {
          cy.findByText("METRIC").should("exist");
          cy.findAllByTestId("well-item").should("have.length", 1);
        });
        H.horizontalWell().within(() => {
          cy.findByText("DIMENSION").should("exist");
          cy.findAllByTestId("well-item").should("have.length", 4);
        });

        // Remove the dimension column from the well
        H.horizontalWell()
          .findAllByTestId("well-item")
          .first()
          .findByLabelText("Remove")
          .click();

        H.assertDataSourceColumnSelected(
          LANDING_PAGE_VIEWS.name,
          "views",
          false,
        );
        H.assertDataSourceColumnSelected(
          CHECKOUT_PAGE_VIEWS.name,
          "views",
          false,
        );
        H.assertDataSourceColumnSelected(
          PAYMENT_DONE_PAGE_VIEWS.name,
          "views",
          false,
        );

        H.verticalWell().findAllByTestId("well-item").should("have.length", 0);
        H.horizontalWell()
          .findAllByTestId("well-item")
          .should("have.length", 0);
      });
    });
  });
});
