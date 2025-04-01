const { H } = cy;

import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import { createDataSourceNameRef } from "metabase/visualizer/utils";
import { createMockColumn } from "metabase-types/api/mocks";

const { PRODUCTS, PRODUCTS_ID, ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

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
    clickVisualizeAnotherWay(ORDERS_COUNT_BY_CREATED_AT.name);

    H.modal().within(() => {
      verticalWell().findByText("Count").should("exist");
      horizontalWell().findByText("Created At: Month").should("exist");

      cy.findByDisplayValue("line").should("be.checked");

      cy.button("Add to dashboard").click();
    });

    H.getDashboardCard(1).within(() => {
      cy.findByText(ORDERS_COUNT_BY_CREATED_AT.name).should("exist");
      cy.findByText("Count").should("exist");
      cy.findByText("Created At: Month").should("exist");
    });

    H.findDashCardAction(H.getDashboardCard(1), "Edit visualization").click();

    H.modal().within(() => {
      cy.button("Add more data").click();
      cy.findByPlaceholderText("Search for something").type("Cre");

      cy.findByText(PRODUCTS_COUNT_BY_CREATED_AT.name).click();
      cy.wait("@cardQuery");

      cy.findByTestId("visualization-root").within(() => {
        cy.findByText("Count").should("exist");
        cy.findByText(`Count (${PRODUCTS_COUNT_BY_CREATED_AT.name})`).should(
          "exist",
        );
      });

      cy.button("Save").click();
    });

    H.getDashboardCard(1).within(() => {
      cy.findByText(ORDERS_COUNT_BY_CREATED_AT.name).should("exist");
      cy.findByText("Count").should("exist");
      cy.findByText(`Count (${PRODUCTS_COUNT_BY_CREATED_AT.name})`).should(
        "exist",
      );
    });

    H.saveDashboard();

    H.getDashboardCard(1).within(() => {
      cy.findByText(ORDERS_COUNT_BY_CREATED_AT.name).should("exist");
      cy.findByText("Count").should("exist");
      cy.findByText(`Count (${PRODUCTS_COUNT_BY_CREATED_AT.name})`).should(
        "exist",
      );
    });
  });

  it("should update an existing dashcard with visualizer", () => {
    cy.get("@ordersCountByCreatedAtQuestionId").then(
      ordersCountByCreatedAtQuestionId => {
        H.addQuestionToDashboard({
          dashboardId: ORDERS_DASHBOARD_ID,
          cardId: ordersCountByCreatedAtQuestionId,
        });
        H.visitDashboard(ORDERS_DASHBOARD_ID);
        H.editDashboard();
      },
    );

    H.findDashCardAction(H.getDashboardCard(1), "Edit visualization").click();

    H.modal().within(() => {
      cy.button("Add more data").click();
      cy.findByPlaceholderText("Search for something").type("Cre");

      cy.findByText(PRODUCTS_COUNT_BY_CREATED_AT.name).click();
      cy.wait("@cardQuery");

      cy.findByTestId("visualization-root").within(() => {
        cy.findByText("Count").should("exist");
        cy.findByText(`Count (${PRODUCTS_COUNT_BY_CREATED_AT.name})`).should(
          "exist",
        );
      });

      cy.button("Save").click();
    });

    H.getDashboardCard(1).within(() => {
      cy.findByText(ORDERS_COUNT_BY_CREATED_AT.name).should("exist");
      cy.findByText("Count").should("exist");
      cy.findByText(`Count (${PRODUCTS_COUNT_BY_CREATED_AT.name})`).should(
        "exist",
      );
    });

    H.saveDashboard();

    H.getDashboardCard(1).within(() => {
      cy.findByText(ORDERS_COUNT_BY_CREATED_AT.name).should("exist");
      cy.findByText("Count").should("exist");
      cy.findByText(`Count (${PRODUCTS_COUNT_BY_CREATED_AT.name})`).should(
        "exist",
      );
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

    H.findDashCardAction(H.getDashboardCard(3), "Edit visualization").click();
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
    function goBackToDashboard() {
      H.queryBuilderHeader().findByLabelText("Back to Test Dashboard").click();
      cy.wait("@dashcardQuery");
    }

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

    goBackToDashboard();

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

    goBackToDashboard();

    H.getDashboardCard(0).within(() => chartLegendItem("Count").click());
    cy.wait("@cardQuery");
    H.queryBuilderHeader()
      .findByText(ORDERS_COUNT_BY_CREATED_AT.name)
      .should("exist");
    H.assertQueryBuilderRowCount(49);

    goBackToDashboard();

    H.getDashboardCard(0).within(() =>
      chartLegendItem(`Count (${PRODUCTS_COUNT_BY_CREATED_AT.name})`).click(),
    );
    cy.wait("@cardQuery");
    H.queryBuilderHeader()
      .findByText(PRODUCTS_COUNT_BY_CREATED_AT.name)
      .should("exist");
    H.assertQueryBuilderRowCount(37);

    goBackToDashboard();

    // 2. Cartesian chart, category breakout
    H.getDashboardCard(1).within(() =>
      H.chartPathWithFillColor(ORDERS_SERIES_COLOR).eq(1).click(),
    );
    H.clickActionsPopover().findByText("See these Orders").click();
    cy.wait("@dataset");

    H.queryBuilderFiltersPanel().children().should("have.length", 1);
    H.queryBuilderFiltersPanel().findByText("Product → Category is Gadget");
    H.tableInteractiveHeader().findByText("Subtotal"); // ensure we're on the Orders table

    goBackToDashboard();

    H.getDashboardCard(1).within(() =>
      H.chartPathWithFillColor(PRODUCTS_SERIES_COLOR).eq(0).click(),
    );
    H.clickActionsPopover().button(">").click();
    cy.wait("@dataset");

    H.queryBuilderFiltersPanel().children().should("have.length", 1);
    H.queryBuilderFiltersPanel().findByText("Count is greater than 42");
    H.assertQueryBuilderRowCount(3);

    goBackToDashboard();

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

    goBackToDashboard();

    // 4. Funnel (regular)
    H.getDashboardCard(4).get("polygon").first().click();
    cy.wait(200); // HACK: wait for popover to appear
    H.clickActionsPopover().button("=").click();
    cy.wait("@dataset");

    H.queryBuilderFiltersPanel().children().should("have.length", 1);
    H.queryBuilderFiltersPanel().findByText("Views is equal to 600");
    H.tableInteractiveHeader().findByText("Views").should("exist");
    H.assertQueryBuilderRowCount(1);

    goBackToDashboard();

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
    clickVisualizeAnotherWay(ORDERS_COUNT_BY_PRODUCT_CATEGORY.name);

    H.modal().within(() => {
      // Turn into a pie chart
      cy.findByTestId("viz-picker-main").icon("pie").click();
      assertDataSourceColumnSelected(
        ORDERS_COUNT_BY_PRODUCT_CATEGORY.name,
        "Count",
      );
      assertDataSourceColumnSelected(
        ORDERS_COUNT_BY_PRODUCT_CATEGORY.name,
        "Product → Category",
      );
      pieMetricWell().findByText("Count").should("exist");
      pieDimensionWell().findByText("Product → Category").should("exist");
      H.echartsContainer().findByText("18,760").should("exist"); // total value

      // Turn into a funnel
      cy.findByTestId("viz-picker-main").icon("funnel").click();
      assertDataSourceColumnSelected(
        ORDERS_COUNT_BY_PRODUCT_CATEGORY.name,
        "Count",
      );
      assertDataSourceColumnSelected(
        ORDERS_COUNT_BY_PRODUCT_CATEGORY.name,
        "Product → Category",
      );
      verticalWell().findByText("Count").should("exist");
      horizontalWell().within(() => {
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

      // Cartesian chart
      H.findDashCardAction(H.getDashboardCard(0), "Edit visualization").click();
      H.modal().within(() => {
        cy.button("Settings").click();

        H.goalLine().should("not.exist");
        vizSettingControl("Goal line")
          .findByRole("switch")
          .click({ force: true });
        H.goalLine().should("exist");

        // TODO Fix multi-series chart settings and extend the test
        chartLegend().findByText("Series B").should("not.exist");
        cy.findAllByTestId("series-name-input")
          .eq(1)
          .type("{selectall}{del}Series B")
          .blur();
        chartLegend().findByText("Series B").should("exist");

        cy.button("Save").click();
      });
      H.getDashboardCard(0).within(() => {
        H.goalLine().should("exist");
        chartLegend().findByText("Series B").should("exist");
      });

      // Pie chart
      H.findDashCardAction(H.getDashboardCard(2), "Edit visualization").click();
      H.modal().within(() => {
        cy.button("Settings").click();
        cy.findByText("Display").click();

        H.echartsContainer().within(() => {
          cy.findByText("200").should("exist");
          cy.findByText("TOTAL").should("exist");
        });
        vizSettingControl("Show total")
          .findByRole("switch")
          .click({ force: true });
        H.echartsContainer().within(() => {
          cy.findByText("200").should("not.exist");
          cy.findByText("TOTAL").should("not.exist");
        });

        cy.button("Save").click();
      });
    });

    describe("timeseries breakout", () => {
      it("should automatically use new columns whenever possible", () => {
        const Q1_NAME = ORDERS_COUNT_BY_CREATED_AT.name;
        const Q2_NAME = PRODUCTS_COUNT_BY_CREATED_AT.name;

        H.visitDashboard(ORDERS_DASHBOARD_ID);
        H.editDashboard();
        H.openQuestionsSidebar();

        clickVisualizeAnotherWay(Q1_NAME);

        H.modal().within(() => {
          cy.button("Add more data").click();
          cy.findByPlaceholderText("Search for something").type("Pro");
          cy.findByText(Q2_NAME).click();
          cy.wait("@cardQuery");
          cy.button("Done").click();

          verticalWell().within(() => {
            cy.findByText("Count").should("exist");
            cy.findByText(`Count (${Q2_NAME})`).should("exist");
          });
          horizontalWell().findByText("Created At: Month").should("exist");

          cy.findByDisplayValue("line").should("be.checked");

          H.echartsContainer().within(() => {
            // x-axis labels
            cy.findByText("January 2023").should("exist");
            cy.findByText("January 2026").should("exist");
            // y-axis labels
            cy.findByText("600").should("exist");
            cy.findByText("10").should("exist");
          });

          dataSource(Q1_NAME).should("exist");
          dataSource(Q2_NAME).should("exist");
          assertDataSourceColumnSelected(Q1_NAME, "Count");
          assertDataSourceColumnSelected(Q1_NAME, "Created At: Month");
          assertDataSourceColumnSelected(Q2_NAME, "Count");
          assertDataSourceColumnSelected(Q2_NAME, "Created At: Month");
          chartLegendItems().should("have.length", 2);

          // Remove 2nd count column from the data manager
          dataSourceColumn(Q2_NAME, "Count").findByLabelText("Remove").click();
          assertDataSourceColumnSelected(Q2_NAME, "Count", false);
          verticalWell().findByText(`Count (${Q2_NAME})`).should("not.exist");
          // legend is visible only when there are multiple series
          chartLegend().should("not.exist");

          // Add 2nd count column from the data manager
          dataSourceColumn(Q2_NAME, "Count").click();
          assertDataSourceColumnSelected(Q2_NAME, "Count");
          verticalWell().findByText(`Count (${Q2_NAME})`).should("exist");
          chartLegendItems().should("have.length", 2);

          // Remove all count columns from the well
          verticalWell().within(() => {
            cy.findAllByTestId("well-item")
              .first()
              .findByLabelText("Remove")
              .click();
            cy.findByTestId("well-item").findByLabelText("Remove").click();
          });
          assertDataSourceColumnSelected(Q1_NAME, "Count", false);
          assertDataSourceColumnSelected(Q2_NAME, "Count", false);
          chartLegend().should("not.exist");

          // Remove all "created at" columns from the well
          horizontalWell()
            .findByTestId("well-item")
            .findByLabelText("Remove")
            .click();
          assertDataSourceColumnSelected(Q1_NAME, "Created At: Month", false);
          assertDataSourceColumnSelected(Q2_NAME, "Created At: Month", false);
          chartLegend().should("not.exist");

          // Add all columns back
          dataSourceColumn(Q1_NAME, "Count").click();
          dataSourceColumn(Q1_NAME, "Created At: Month").click();
          dataSourceColumn(Q2_NAME, "Count").click();
          dataSourceColumn(Q2_NAME, "Created At: Month").click();
          verticalWell().findAllByTestId("well-item").should("have.length", 2);
          horizontalWell()
            .findAllByTestId("well-item")
            .should("have.length", 1);
          chartLegendItems().should("have.length", 2);

          // Remove 2nd data source
          removeDataSource(Q2_NAME);
          dataManager().within(() => {
            cy.findByText(Q2_NAME).should("not.exist");
            cy.findAllByText("Count").should("have.length", 1);
            cy.findAllByText("Created At: Month").should("have.length", 1);
          });
          verticalWell().findAllByTestId("well-item").should("have.length", 1);
          horizontalWell()
            .findAllByTestId("well-item")
            .should("have.length", 1);
          chartLegend().should("not.exist");
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

        clickVisualizeAnotherWay(Q1_NAME);

        H.modal().within(() => {
          cy.button("Add more data").click();
          cy.findByPlaceholderText("Search for something").type("Pro");
          cy.findByText(Q2_NAME).click();
          cy.wait("@cardQuery");
          cy.button("Done").click();

          verticalWell().within(() => {
            cy.findByText("Count").should("exist");
            cy.findByText(`Count (${Q2_NAME})`).should("exist");
          });
          horizontalWell().findByText("Product → Category").should("exist");

          cy.findByDisplayValue("bar").should("be.checked");

          H.echartsContainer().within(() => {
            // x-axis labels
            cy.findByText("Doohickey").should("exist");
            cy.findByText("Widget").should("exist");
            // y-axis labels
            cy.findByText("6,000").should("exist");
            cy.findByText("1,000").should("exist");
          });

          dataSource(Q1_NAME).should("exist");
          dataSource(Q2_NAME).should("exist");
          assertDataSourceColumnSelected(Q1_NAME, "Count");
          assertDataSourceColumnSelected(Q1_NAME, "Product → Category");
          assertDataSourceColumnSelected(Q2_NAME, "Count");
          assertDataSourceColumnSelected(Q2_NAME, "Category");
          chartLegendItems().should("have.length", 2);

          // Remove 2nd count column from the data manager
          dataSourceColumn(Q2_NAME, "Count").findByLabelText("Remove").click();
          assertDataSourceColumnSelected(Q2_NAME, "Count", false);
          verticalWell().findByText(`Count (${Q2_NAME})`).should("not.exist");
          // legend is visible only when there are multiple series
          chartLegend().should("not.exist");

          // Add 2nd count column from the data manager
          dataSourceColumn(Q2_NAME, "Count").click();
          assertDataSourceColumnSelected(Q2_NAME, "Count");
          verticalWell().findByText(`Count (${Q2_NAME})`).should("exist");
          chartLegendItems().should("have.length", 2);

          // Remove all count columns from the well
          verticalWell().within(() => {
            cy.findAllByTestId("well-item")
              .first()
              .findByLabelText("Remove")
              .click();
            cy.findByTestId("well-item").findByLabelText("Remove").click();
          });
          assertDataSourceColumnSelected(Q1_NAME, "Count", false);
          assertDataSourceColumnSelected(Q2_NAME, "Count", false);
          chartLegend().should("not.exist");

          // Remove all "category" columns from the well
          horizontalWell()
            .findByTestId("well-item")
            .findByLabelText("Remove")
            .click();
          assertDataSourceColumnSelected(Q1_NAME, "Product → Category", false);
          assertDataSourceColumnSelected(Q2_NAME, "Category", false);
          chartLegend().should("not.exist");

          // Add all columns back
          dataSourceColumn(Q1_NAME, "Count").click();
          dataSourceColumn(Q1_NAME, "Product → Category").click();
          dataSourceColumn(Q2_NAME, "Count").click();
          dataSourceColumn(Q2_NAME, "Category").click();
          verticalWell().findAllByTestId("well-item").should("have.length", 2);
          horizontalWell()
            .findAllByTestId("well-item")
            .should("have.length", 1);
          chartLegendItems().should("have.length", 2);

          // Remove 2nd data source
          removeDataSource(Q2_NAME);
          dataManager().within(() => {
            cy.findByText(Q2_NAME).should("not.exist");
            cy.findAllByText("Count").should("have.length", 1);
            cy.findAllByText("Category").should("not.exist");
          });
          verticalWell().findAllByTestId("well-item").should("have.length", 1);
          horizontalWell()
            .findAllByTestId("well-item")
            .should("have.length", 1);
          chartLegend().should("not.exist");
        });
      });
    });
  });

  describe("funnels", () => {
    it("should build a funnel", () => {
      H.visitDashboard(ORDERS_DASHBOARD_ID);
      H.editDashboard();

      H.openQuestionsSidebar();
      clickVisualizeAnotherWay(STEP_COLUMN_CARD.name);

      H.modal().findByTestId("viz-picker-menu").click();
      H.popover().findByText("Funnel").click();

      H.modal().within(() => {
        cy.button("Add more data").click();
        cy.findByPlaceholderText("Search for something").type("view");
        cy.findByText(VIEWS_COLUMN_CARD.name).click();
        cy.wait("@cardQuery");
        cy.button("Done").click();

        assertDataSourceColumnSelected(STEP_COLUMN_CARD.name, "Step");
        assertDataSourceColumnSelected(VIEWS_COLUMN_CARD.name, "Views");

        verticalWell().within(() => {
          cy.findByText("Views").should("exist");
          cy.findAllByTestId("well-item").should("have.length", 1);
        });
        horizontalWell().within(() => {
          cy.findByText("Step").should("exist");
          cy.findByText("Checkout page").should("exist");
          cy.findByText("Landing page").should("exist");
          cy.findByText("Payment done page").should("exist");
          cy.findAllByTestId("well-item").should("have.length", 4);
        });

        // Remove a column from the data manager
        dataSourceColumn(STEP_COLUMN_CARD.name, "Step")
          .findByLabelText("Remove")
          .click();
        assertDataSourceColumnSelected(STEP_COLUMN_CARD.name, "Step", false);
        verticalWell().within(() => {
          cy.findByText("Views").should("exist");
          cy.findAllByTestId("well-item").should("have.length", 1);
        });
        horizontalWell().within(() => {
          cy.findByText("(empty)").should("exist");
          cy.findAllByTestId("well-item").should("have.length", 1);
        });

        // Add a column back
        dataSourceColumn(STEP_COLUMN_CARD.name, "Step").click();
        assertDataSourceColumnSelected(STEP_COLUMN_CARD.name, "Step");
        verticalWell().within(() => {
          cy.findByText("Views").should("exist");
          cy.findAllByTestId("well-item").should("have.length", 1);
        });
        horizontalWell().within(() => {
          cy.findByText("Step").should("exist");
          cy.findAllByTestId("well-item").should("have.length", 4);
        });

        // Remove the metric column from the well
        verticalWell()
          .findByTestId("well-item")
          .findByLabelText("Remove")
          .click();
        assertDataSourceColumnSelected(VIEWS_COLUMN_CARD.name, "Views", false);
        verticalWell().findAllByTestId("well-item").should("have.length", 0);
        horizontalWell().findAllByTestId("well-item").should("have.length", 4);

        // Remove the dimension column from the well
        horizontalWell()
          .findAllByTestId("well-item")
          .first()
          .findByLabelText("Remove")
          .click();
        assertDataSourceColumnSelected(STEP_COLUMN_CARD.name, "Step", false);
        verticalWell().findAllByTestId("well-item").should("have.length", 0);
        horizontalWell().findAllByTestId("well-item").should("have.length", 0);

        // Rebuild the funnel
        dataSourceColumn(STEP_COLUMN_CARD.name, "Step").click();
        dataSourceColumn(VIEWS_COLUMN_CARD.name, "Views").click();
        assertDataSourceColumnSelected(STEP_COLUMN_CARD.name, "Step");
        assertDataSourceColumnSelected(VIEWS_COLUMN_CARD.name, "Views");
        verticalWell().within(() => {
          cy.findByText("Views").should("exist");
          cy.findAllByTestId("well-item").should("have.length", 1);
        });
        horizontalWell().within(() => {
          cy.findByText("Step").should("exist");
          cy.findAllByTestId("well-item").should("have.length", 4);
        });

        // Remove a data source
        removeDataSource(VIEWS_COLUMN_CARD.name);
        dataManager().within(() => {
          cy.findByText(VIEWS_COLUMN_CARD.name).should("not.exist");
          cy.findByText("Views").should("not.exist");
        });
        verticalWell().findAllByTestId("well-item").should("have.length", 0);
        horizontalWell().findAllByTestId("well-item").should("have.length", 4);
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

        cy.button("Add more data").click();
        cy.findByPlaceholderText("Search for something").type("Page");
        cy.findByText(LANDING_PAGE_VIEWS.name).click();
        cy.wait("@cardQuery");
        cy.findByText(CHECKOUT_PAGE_VIEWS.name).click();
        cy.wait("@cardQuery");
        cy.findByText(PAYMENT_DONE_PAGE_VIEWS.name).click();
        cy.wait("@cardQuery");
        cy.button("Done").click();

        assertDataSourceColumnSelected(LANDING_PAGE_VIEWS.name, "views");
        assertDataSourceColumnSelected(CHECKOUT_PAGE_VIEWS.name, "views");
        assertDataSourceColumnSelected(PAYMENT_DONE_PAGE_VIEWS.name, "views");

        verticalWell().within(() => {
          cy.findByText("METRIC").should("exist");
          cy.findAllByTestId("well-item").should("have.length", 1);
        });
        horizontalWell().within(() => {
          cy.findByText("DIMENSION").should("exist");
          cy.findByText(LANDING_PAGE_VIEWS.name).should("exist");
          cy.findByText(CHECKOUT_PAGE_VIEWS.name).should("exist");
          cy.findByText(PAYMENT_DONE_PAGE_VIEWS.name).should("exist");
          cy.findAllByTestId("well-item").should("have.length", 4);
        });

        // Remove a column from the data manager
        dataSourceColumn(CHECKOUT_PAGE_VIEWS.name, "views")
          .findByLabelText("Remove")
          .click();
        assertDataSourceColumnSelected(
          CHECKOUT_PAGE_VIEWS.name,
          "views",
          false,
        );
        verticalWell().within(() => {
          cy.findByText("METRIC").should("exist");
          cy.findAllByTestId("well-item").should("have.length", 1);
        });
        horizontalWell().within(() => {
          cy.findByText("DIMENSION").should("exist");
          cy.findAllByTestId("well-item").should("have.length", 3);
        });

        // Add a column back
        dataSourceColumn(CHECKOUT_PAGE_VIEWS.name, "views").click();
        assertDataSourceColumnSelected(CHECKOUT_PAGE_VIEWS.name, "views");
        verticalWell().within(() => {
          cy.findByText("METRIC").should("exist");
          cy.findAllByTestId("well-item").should("have.length", 1);
        });
        horizontalWell().within(() => {
          cy.findByText("DIMENSION").should("exist");
          cy.findAllByTestId("well-item").should("have.length", 4);
        });

        // Remove the metric column from the well
        verticalWell()
          .findByTestId("well-item")
          .findByLabelText("Remove")
          .click();

        assertDataSourceColumnSelected(LANDING_PAGE_VIEWS.name, "views", false);
        assertDataSourceColumnSelected(
          CHECKOUT_PAGE_VIEWS.name,
          "views",
          false,
        );
        assertDataSourceColumnSelected(
          PAYMENT_DONE_PAGE_VIEWS.name,
          "views",
          false,
        );

        verticalWell().findAllByTestId("well-item").should("have.length", 0);
        horizontalWell().findAllByTestId("well-item").should("have.length", 0);

        // Rebuild the funnel
        dataSourceColumn(LANDING_PAGE_VIEWS.name, "views").click();
        dataSourceColumn(CHECKOUT_PAGE_VIEWS.name, "views").click();
        dataSourceColumn(PAYMENT_DONE_PAGE_VIEWS.name, "views").click();

        assertDataSourceColumnSelected(LANDING_PAGE_VIEWS.name, "views");
        assertDataSourceColumnSelected(CHECKOUT_PAGE_VIEWS.name, "views");
        assertDataSourceColumnSelected(PAYMENT_DONE_PAGE_VIEWS.name, "views");

        verticalWell().within(() => {
          cy.findByText("METRIC").should("exist");
          cy.findAllByTestId("well-item").should("have.length", 1);
        });
        horizontalWell().within(() => {
          cy.findByText("DIMENSION").should("exist");
          cy.findAllByTestId("well-item").should("have.length", 4);
        });

        // Remove the dimension column from the well
        horizontalWell()
          .findAllByTestId("well-item")
          .first()
          .findByLabelText("Remove")
          .click();

        assertDataSourceColumnSelected(LANDING_PAGE_VIEWS.name, "views", false);
        assertDataSourceColumnSelected(
          CHECKOUT_PAGE_VIEWS.name,
          "views",
          false,
        );
        assertDataSourceColumnSelected(
          PAYMENT_DONE_PAGE_VIEWS.name,
          "views",
          false,
        );

        verticalWell().findAllByTestId("well-item").should("have.length", 0);
        horizontalWell().findAllByTestId("well-item").should("have.length", 0);
      });
    });
  });
});

const ORDERS_COUNT_BY_CREATED_AT = {
  display: "line",
  name: "Orders by Created At (Month)",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
  },
  visualization_settings: {
    "graph.dimensions": ["CREATED_AT"],
    "graph.metrics": ["count"],
  },
};

const ORDERS_COUNT_BY_PRODUCT_CATEGORY = {
  display: "bar",
  name: "Orders by Product Category",
  query: {
    "source-table": ORDERS_ID,
    aggregation: [["count"]],
    breakout: [
      ["field", PRODUCTS.CATEGORY, { "source-field": ORDERS.PRODUCT_ID }],
    ],
  },
  visualization_settings: {
    "graph.dimensions": ["CATEGORY"],
    "graph.metrics": ["count"],
  },
};

const PRODUCTS_COUNT_BY_CREATED_AT = {
  display: "bar",
  name: "Products by Created At (Month)",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [["field", PRODUCTS.CREATED_AT, { "temporal-unit": "month" }]],
  },
  visualization_settings: {
    "graph.dimensions": ["CREATED_AT"],
    "graph.metrics": ["count"],
  },
};

const PRODUCTS_COUNT_BY_CATEGORY = {
  display: "bar",
  name: "Products by Category",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["count"]],
    breakout: [["field", PRODUCTS.CATEGORY, null]],
  },
  visualization_settings: {
    "graph.dimensions": ["CATEGORY"],
    "graph.metrics": ["count"],
  },
};

const PRODUCTS_COUNT_BY_CATEGORY_PIE = {
  ...PRODUCTS_COUNT_BY_CATEGORY,
  display: "pie",
  name: "Products by Category (Pie)",
};

const SCALAR_CARD = {
  LANDING_PAGE_VIEWS: {
    display: "scalar",
    name: "Landing Page",
    native: {
      query: 'SELECT 1000 as "views"',
    },
  },
  CHECKOUT_PAGE_VIEWS: {
    display: "scalar",
    name: "Checkout Page",
    native: {
      query: 'SELECT 600 as "views"',
    },
  },
  PAYMENT_DONE_PAGE_VIEWS: {
    display: "scalar",
    name: "Payment Done Page",
    native: {
      query: 'SELECT 100 as "views"',
    },
  },
};

const STEP_COLUMN_CARD = {
  name: "Step Column",
  display: "table",
  native: {
    query: `
      SELECT 'Landing page' AS "Step"
      UNION
      SELECT 'Checkout page' AS "Step"
      UNION
      SELECT 'Payment done page' AS "Step"
    `,
  },
};

const VIEWS_COLUMN_CARD = {
  name: "Views Column",
  display: "table",
  native: {
    query: `
      SELECT 1000 as "Views"
      UNION
      SELECT 600 as "Views"
      UNION
      SELECT 100 as "Views"
    `,
  },
};

function clickVisualizeAnotherWay(name) {
  H.sidebar().within(() => {
    cy.findByRole("menuitem", { name })
      .parent()
      .button("Visualize another way")
      .click({ force: true });
  });
}

function dataManager() {
  return cy.findByTestId("visualizer-data-manager");
}

function dataSource(dataSourceName) {
  return dataManager()
    .findByText(dataSourceName)
    .parents("[data-testid='data-source-list-item']");
}

function removeDataSource(dataSourceName) {
  dataSource(dataSourceName)
    .findAllByLabelText("Remove")
    .first()
    .click({ force: true });
}

function dataSourceColumn(dataSourceName, columnName) {
  return dataSource(dataSourceName)
    .findByText(columnName)
    .parents("[data-testid='column-list-item']");
}

function assertDataSourceColumnSelected(
  dataSourceName,
  columnName,
  isSelected = true,
) {
  dataSourceColumn(dataSourceName, columnName).should(
    "have.attr",
    "aria-selected",
    String(isSelected),
  );
}

function verticalWell() {
  return cy.findByTestId("vertical-well");
}

function horizontalWell() {
  return cy.findByTestId("horizontal-well");
}

function pieMetricWell() {
  return cy.findByTestId("pie-metric-well");
}

function pieDimensionWell() {
  return cy.findByTestId("pie-dimension-well");
}

function chartLegend() {
  return cy.findByLabelText("Legend");
}

function chartLegendItems() {
  return chartLegend().findAllByTestId("legend-item");
}

function chartLegendItem(name) {
  return chartLegend().findByText(name);
}

function vizSettingControl(fieldTitle) {
  return cy.get(`[data-field-title="${fieldTitle}"]`);
}

function createDatetimeColumn(opts) {
  return createMockColumn({
    base_type: "type/DateTime",
    effective_type: "type/DateTime",
    semantic_type: null,
    unit: "month",
    ...opts,
  });
}

function createCategoryColumn(opts) {
  return createMockColumn({
    base_type: "type/Text",
    effective_type: "type/Text",
    semantic_type: "type/Category",
    ...opts,
  });
}

function createNumericColumn(opts) {
  return createMockColumn({
    base_type: "type/Integer",
    effective_type: "type/Integer",
    semantic_type: null,
    ...opts,
  });
}

function createDashboardWithVisualizerDashcards() {
  cy.get("@ordersCountByCreatedAtQuestionId").then(function () {
    const {
      ordersCountByCreatedAtQuestionId,
      ordersCountByProductCategoryQuestionId,
      productsCountByCategoryQuestionId,
      productsCountByCreatedAtQuestionId,
      landingPageViewsScalarQuestionId,
      checkoutPageViewsScalarQuestionId,
      paymentDonePageViewsScalarQuestionId,
      stepColumnQuestionId,
      viewsColumnQuestionId,
    } = this;

    H.createDashboard().then(({ body: { id: dashboardId } }) => {
      const dc1 = createVisualizerDashcardWithTimeseriesBreakout(
        ordersCountByCreatedAtQuestionId,
        productsCountByCreatedAtQuestionId,
        {
          id: -1,
          col: 0,
          row: 0,
          size_x: 12,
          size_y: 8,
        },
      );

      const dc2 = createVisualizerDashcardWithCategoryBreakout(
        ordersCountByProductCategoryQuestionId,
        productsCountByCategoryQuestionId,
        {
          id: -2,
          col: 12,
          row: 0,
          size_x: 12,
          size_y: 8,
        },
      );

      const dc3 = createVisualizerPieChartDashcard(
        productsCountByCategoryQuestionId,
        {
          id: -3,
          col: 0,
          row: 8,
          size_x: 12,
          size_y: 8,
        },
      );

      const dc4 = {
        id: -4,
        card_id: productsCountByCreatedAtQuestionId,

        col: 12,
        row: 8,
        size_x: 12,
        size_y: 8,
      };

      const dc5 = createVisualizerFunnel(
        stepColumnQuestionId,
        viewsColumnQuestionId,
        {
          id: -5,
          col: 0,
          row: 16,
          size_x: 12,
          size_y: 8,
        },
      );

      const dc6 = createVisualizerScalarFunnel(
        landingPageViewsScalarQuestionId,
        checkoutPageViewsScalarQuestionId,
        paymentDonePageViewsScalarQuestionId,
        {
          id: -6,
          col: 12,
          row: 16,
          size_x: 12,
          size_y: 8,
        },
      );

      cy.request("PUT", `/api/dashboard/${dashboardId}`, {
        dashcards: [dc1, dc2, dc3, dc4, dc5, dc6],
      }).then(() => {
        H.visitDashboard(dashboardId);
      });
    });
  });
}

function createVisualizerDashcardWithTimeseriesBreakout(
  ordersCountByCreatedAtQuestionId,
  productsCountByCreatedAtQuestionId,
  dashcardOpts = {},
) {
  return {
    id: -1,

    ...dashcardOpts,

    card_id: ordersCountByCreatedAtQuestionId,
    series: [
      {
        id: productsCountByCreatedAtQuestionId,
        ...PRODUCTS_COUNT_BY_CREATED_AT,
      },
    ],

    visualization_settings: {
      visualization: {
        display: "line",
        columns: [
          createDatetimeColumn({
            id: ORDERS.CREATED_AT,
            name: "COLUMN_1",
            display_name: "Created At: Month",
          }),
          createNumericColumn({
            name: "COLUMN_2",
            display_name: "Count",
          }),
          createDatetimeColumn({
            id: PRODUCTS.CREATED_AT,
            name: "COLUMN_3",
            display_name: `Created At: Month (${PRODUCTS_COUNT_BY_CREATED_AT.name})`,
          }),
          createNumericColumn({
            name: "COLUMN_4",
            display_name: `Count (${PRODUCTS_COUNT_BY_CREATED_AT.name})`,
          }),
        ],
        columnValuesMapping: {
          COLUMN_1: [
            {
              name: "COLUMN_1",
              originalName: "CREATED_AT",
              sourceId: `card:${ordersCountByCreatedAtQuestionId}`,
            },
          ],
          COLUMN_2: [
            {
              name: "COLUMN_2",
              originalName: "count",
              sourceId: `card:${ordersCountByCreatedAtQuestionId}`,
            },
          ],
          COLUMN_3: [
            {
              name: "COLUMN_3",
              originalName: "CREATED_AT",
              sourceId: `card:${productsCountByCreatedAtQuestionId}`,
            },
          ],
          COLUMN_4: [
            {
              name: "COLUMN_4",
              originalName: "count",
              sourceId: `card:${productsCountByCreatedAtQuestionId}`,
            },
          ],
        },
        settings: {
          "card.title": "My chart",
          "graph.dimensions": ["COLUMN_1", "COLUMN_3"],
          "graph.metrics": ["COLUMN_2", "COLUMN_4"],
        },
      },
    },
  };
}

function createVisualizerDashcardWithCategoryBreakout(
  ordersCountByCategoryQuestionId,
  productsCountByCategoryQuestionId,
  dashcardOpts = {},
) {
  return {
    id: -1,

    ...dashcardOpts,

    card_id: ordersCountByCategoryQuestionId,
    series: [
      {
        id: productsCountByCategoryQuestionId,
        ...PRODUCTS_COUNT_BY_CATEGORY,
      },
    ],

    visualization_settings: {
      visualization: {
        display: "bar",
        columns: [
          createCategoryColumn({
            id: PRODUCTS.CATEGORY,
            fk_field_id: ORDERS.PRODUCT_ID,
            name: "COLUMN_1",
            display_name: "Category",
          }),
          createNumericColumn({
            name: "COLUMN_2",
            display_name: "Count",
          }),
          createCategoryColumn({
            id: PRODUCTS.CATEGORY,
            name: "COLUMN_3",
            display_name: `Category (${PRODUCTS_COUNT_BY_CATEGORY.name})`,
          }),
          createNumericColumn({
            name: "COLUMN_4",
            display_name: `Count (${PRODUCTS_COUNT_BY_CATEGORY.name})`,
          }),
        ],
        columnValuesMapping: {
          COLUMN_1: [
            {
              name: "COLUMN_1",
              originalName: "CATEGORY",
              sourceId: `card:${ordersCountByCategoryQuestionId}`,
            },
          ],
          COLUMN_2: [
            {
              name: "COLUMN_2",
              originalName: "count",
              sourceId: `card:${ordersCountByCategoryQuestionId}`,
            },
          ],
          COLUMN_3: [
            {
              name: "COLUMN_3",
              originalName: "CATEGORY",
              sourceId: `card:${productsCountByCategoryQuestionId}`,
            },
          ],
          COLUMN_4: [
            {
              name: "COLUMN_4",
              originalName: "count",
              sourceId: `card:${productsCountByCategoryQuestionId}`,
            },
          ],
        },
        settings: {
          "card.title": "My category chart",
          "graph.dimensions": ["COLUMN_1", "COLUMN_3"],
          "graph.metrics": ["COLUMN_2", "COLUMN_4"],
        },
      },
    },
  };
}

function createVisualizerPieChartDashcard(
  productsCountByCategoryQuestionId,
  dashcardOpts = {},
) {
  return {
    id: -1,
    card_id: productsCountByCategoryQuestionId,
    ...dashcardOpts,
    visualization_settings: {
      visualization: {
        display: "pie",
        columns: [
          createCategoryColumn({
            id: PRODUCTS.CATEGORY,
            name: "COLUMN_1",
            display_name: "Category",
          }),
          createNumericColumn({
            name: "COLUMN_2",
            display_name: "Count",
          }),
        ],
        columnValuesMapping: {
          COLUMN_1: [
            {
              name: "COLUMN_1",
              originalName: "CATEGORY",
              sourceId: `card:${productsCountByCategoryQuestionId}`,
            },
          ],
          COLUMN_2: [
            {
              name: "COLUMN_2",
              originalName: "count",
              sourceId: `card:${productsCountByCategoryQuestionId}`,
            },
          ],
        },
        settings: {
          "pie.metric": "COLUMN_2",
          "pie.dimension": ["COLUMN_1"],
        },
      },
    },
  };
}

function createVisualizerFunnel(
  stepColumnQuestionId,
  viewsColumnQuestionId,
  dashcardOpts = {},
) {
  return {
    id: -1,

    ...dashcardOpts,

    card_id: stepColumnQuestionId,
    series: [{ id: viewsColumnQuestionId, ...VIEWS_COLUMN_CARD }],

    visualization_settings: {
      visualization: {
        display: "funnel",
        columns: [
          createCategoryColumn({ name: "COLUMN_1", display_name: "Step" }),
          createNumericColumn({ name: "COLUMN_2", display_name: "Views" }),
        ],
        columnValuesMapping: {
          COLUMN_1: [
            {
              name: "COLUMN_1",
              originalName: "Step",
              sourceId: `card:${stepColumnQuestionId}`,
            },
          ],
          COLUMN_2: [
            {
              name: "COLUMN_2",
              originalName: "Views",
              sourceId: `card:${viewsColumnQuestionId}`,
            },
          ],
        },
        settings: {
          "card.title": "Regular visualizer funnel",
          "funnel.metric": "COLUMN_2",
          "funnel.dimension": "COLUMN_1",
        },
      },
    },
  };
}

function createVisualizerScalarFunnel(
  landingPageViewsScalarQuestionId,
  checkoutPageViewsScalarQuestionId,
  paymentDonePageViewsScalarQuestionId,
  dashcardOpts = {},
) {
  return {
    id: -1,

    ...dashcardOpts,

    card_id: landingPageViewsScalarQuestionId,
    series: [
      {
        id: checkoutPageViewsScalarQuestionId,
        ...SCALAR_CARD.CHECKOUT_PAGE_VIEWS,
      },
      {
        id: paymentDonePageViewsScalarQuestionId,
        ...SCALAR_CARD.PAYMENT_DONE_PAGE_VIEWS,
      },
    ],

    visualization_settings: {
      visualization: {
        display: "funnel",
        columns: [
          createNumericColumn({ name: "METRIC", display_name: "METRIC" }),
          createCategoryColumn({
            name: "DIMENSION",
            display_name: "DIMENSION",
          }),
        ],
        columnValuesMapping: {
          METRIC: [
            {
              sourceId: `card:${landingPageViewsScalarQuestionId}`,
              originalName: "views",
              name: "COLUMN_1",
            },
            {
              sourceId: `card:${checkoutPageViewsScalarQuestionId}`,
              originalName: "views",
              name: "COLUMN_2",
            },
            {
              sourceId: `card:${paymentDonePageViewsScalarQuestionId}`,
              originalName: "views",
              name: "COLUMN_3",
            },
          ],
          DIMENSION: [
            createDataSourceNameRef(`card:${landingPageViewsScalarQuestionId}`),
            createDataSourceNameRef(
              `card:${checkoutPageViewsScalarQuestionId}`,
            ),
            createDataSourceNameRef(
              `card:${paymentDonePageViewsScalarQuestionId}`,
            ),
          ],
        },
        settings: {
          "card.title": "Scalar funnel",
          "funnel.metric": "METRIC",
          "funnel.dimension": "DIMENSION",
        },
      },
    },
  };
}
