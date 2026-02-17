const { H } = cy;

import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";
import {
  ORDERS_COUNT_BY_CREATED_AT,
  ORDERS_COUNT_BY_CREATED_AT_AND_PRODUCT_CATEGORY,
  ORDERS_COUNT_BY_PRODUCT_CATEGORY,
  PIVOT_TABLE_CARD,
  PRODUCTS_AVERAGE_BY_CREATED_AT,
  PRODUCTS_COUNT_BY_CATEGORY,
  PRODUCTS_COUNT_BY_CATEGORY_PIE,
  PRODUCTS_COUNT_BY_CREATED_AT,
  PRODUCTS_COUNT_BY_CREATED_AT_AND_CATEGORY,
  SCALAR_CARD,
  STEP_COLUMN_CARD,
  VIEWS_COLUMN_CARD,
  createDashboardWithVisualizerDashcards,
} from "e2e/support/test-visualizer-data";

describe("scenarios > dashboard > visualizer > cartesian", () => {
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
    H.createQuestion(ORDERS_COUNT_BY_CREATED_AT_AND_PRODUCT_CATEGORY, {
      idAlias: "ordersCountByCreatedAtAndProductCategoryQuestionId",
      wrapId: true,
    });
    H.createQuestion(PRODUCTS_COUNT_BY_CREATED_AT, {
      idAlias: "productsCountByCreatedAtQuestionId",
      wrapId: true,
    });
    H.createQuestion(PRODUCTS_COUNT_BY_CREATED_AT_AND_CATEGORY, {
      idAlias: "productsCountByCreatedAtAndCategoryQuestionId",
      wrapId: true,
    });
    H.createQuestion(PRODUCTS_AVERAGE_BY_CREATED_AT, {
      idAlias: "productsAvgByCreatedAtQuestionId",
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

  it("should allow to change viz settings", () => {
    createDashboardWithVisualizerDashcards();
    H.editDashboard();

    H.showDashcardVisualizerModalSettings(0);

    H.modal().within(() => {
      H.goalLine().should("not.exist");
      cy.findByTestId("chartsettings-sidebar").findByText("Goal line").click();
      H.goalLine().should("exist");

      // Ensure the chart legend contains original series name
      H.chartLegend().within(() => {
        cy.findByText(PRODUCTS_COUNT_BY_CREATED_AT.name).should("exist");
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

    H.popover().findByLabelText("#F9D45C").click();

    const assertUpdatedVizSettingsApplied = () => {
      H.goalLine().should("exist");
      // Ensure the chart legend contains renamed series
      H.chartLegend().within(() => {
        cy.findByText("Series B").should("exist");
        cy.findByText(PRODUCTS_COUNT_BY_CREATED_AT.name).should("not.exist");
      });
      H.chartPathWithFillColor("#F9D45C");
    };

    H.modal().within(() => {
      assertUpdatedVizSettingsApplied();
    });

    H.saveDashcardVisualizerModalSettings();

    H.getDashboardCard(0).within(() => {
      assertUpdatedVizSettingsApplied();
    });
  });

  it("should work correctly when built from a non-cartesian chart", () => {
    H.createQuestion(PIVOT_TABLE_CARD);

    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();
    H.openQuestionsSidebar();
    H.clickVisualizeAnotherWay(PIVOT_TABLE_CARD.name);

    H.modal().within(() => {
      H.switchToAddMoreData();
      H.selectDataset(ORDERS_COUNT_BY_CREATED_AT.name);
      H.switchToColumnsList();
      // Shouldn't this be automatic though?
      H.selectColumnFromColumnsList(ORDERS_COUNT_BY_CREATED_AT.name, "Count");

      // VIZ-668 pivot-grouping is an internal column sued byt he pivot table and shouldn't be
      // shown in the columns list
      cy.findByText("pivot-grouping").should("not.exist");

      H.verticalWell().within(() => {
        cy.findByText("Count").should("exist");

        cy.findByText(`Count (${ORDERS_COUNT_BY_CREATED_AT.name})`).should(
          "exist",
        );
        cy.findAllByTestId("well-item").should("have.length", 2);
      });
      H.horizontalWell().within(() => {
        cy.findByText("Created At: Year").should("exist");
        cy.findAllByTestId("well-item").should("have.length", 1);
      });

      H.chartLegendItems().should("have.length", 2);
    });
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
      H.selectDataset(PRODUCTS_AVERAGE_BY_CREATED_AT.name);
      H.assertWellItemsCount({ vertical: 2 });
      H.selectDataset(PRODUCTS_COUNT_BY_CREATED_AT.name);
      H.assertWellItemsCount({ vertical: 3 });
    });

    H.saveDashcardVisualizerModal({ mode: "create" });
    // Wait for card queries before saving the dashboard
    H.getDashboardCard(0).within(() => {
      cy.findByText(PRODUCTS_COUNT_BY_CREATED_AT.name).should("exist");
      cy.findByText("Created At: Month").should("exist");
    });

    H.saveDashboard();

    // Making sure the card renders after saving the dashboard
    H.getDashboardCard(0).within(() => {
      cy.findByText(PRODUCTS_COUNT_BY_CREATED_AT.name).should("exist");
      cy.findByText("Created At: Month").should("exist");
    });
  });

  it("should not drop dimensions when changing viz type to another cartesian chart (VIZ-648)", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();
    H.openQuestionsSidebar();

    H.clickVisualizeAnotherWay(
      ORDERS_COUNT_BY_CREATED_AT_AND_PRODUCT_CATEGORY.name,
    );

    H.modal().within(() => {
      H.selectVisualization("area");

      H.assertDataSourceColumnSelected(
        ORDERS_COUNT_BY_CREATED_AT_AND_PRODUCT_CATEGORY.name,
        "Count",
      );
      H.assertDataSourceColumnSelected(
        ORDERS_COUNT_BY_CREATED_AT_AND_PRODUCT_CATEGORY.name,
        "Created At: Month",
      );
      H.assertDataSourceColumnSelected(
        ORDERS_COUNT_BY_CREATED_AT_AND_PRODUCT_CATEGORY.name,
        "Product → Category",
      );
    });
  });

  it("should preserve default colors (VIZ-1211)", () => {
    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();
    H.openQuestionsSidebar();

    H.sidebar().within(() => {
      cy.findByRole("menuitem", {
        name: ORDERS_COUNT_BY_PRODUCT_CATEGORY.name,
      }).click();
    });

    H.showDashcardVisualizerModal(1, {
      isVisualizerCard: false,
    });

    H.modal().within(() => {
      H.chartPathWithFillColor("#509EE3").should("have.length", 4);
    });
  });

  it("should handle implicit viz settings (VIZ-947)", () => {
    function assertDataSourceColumnSelected(
      columnName: string,
      isSelected = true,
    ) {
      H.assertDataSourceColumnSelected(
        PIVOT_TABLE_CARD.name,
        columnName,
        isSelected,
      );
    }

    H.createQuestion(PIVOT_TABLE_CARD);

    H.visitDashboard(ORDERS_DASHBOARD_ID);
    H.editDashboard();
    H.openQuestionsSidebar();
    H.clickVisualizeAnotherWay(PIVOT_TABLE_CARD.name);

    H.modal().within(() => {
      assertDataSourceColumnSelected("Count");
      assertDataSourceColumnSelected("Average of Quantity", false);
      assertDataSourceColumnSelected("Created At: Year");
      assertDataSourceColumnSelected("Product → Category", false);
      H.chartPathWithFillColor("#509EE3").should("have.length", 5);
      H.verticalWell().findAllByTestId("well-item").should("have.length", 1);
      H.horizontalWell().findAllByTestId("well-item").should("have.length", 1);

      // Add Category column
      H.dataSourceColumn(PIVOT_TABLE_CARD.name, "Product → Category").click();
      assertDataSourceColumnSelected("Count");
      assertDataSourceColumnSelected("Average of Quantity", false);
      assertDataSourceColumnSelected("Created At: Year");
      assertDataSourceColumnSelected("Product → Category");
      H.chartLegendItems().should("have.length", 5);
      H.verticalWell().findAllByTestId("well-item").should("have.length", 1);
      H.horizontalWell().findAllByTestId("well-item").should("have.length", 2);

      // Add Average of Quantity column
      H.dataSourceColumn(PIVOT_TABLE_CARD.name, "Average of Quantity").click();
      assertDataSourceColumnSelected("Count");
      assertDataSourceColumnSelected("Average of Quantity");
      assertDataSourceColumnSelected("Created At: Year");
      assertDataSourceColumnSelected("Product → Category");
      H.chartLegendItems().should("have.length", 5);
      H.verticalWell().findAllByTestId("well-item").should("have.length", 2);
      H.horizontalWell().findAllByTestId("well-item").should("have.length", 2);

      // Remove dimensions
      H.deselectColumnFromColumnsList(
        PIVOT_TABLE_CARD.name,
        "Created At: Year",
      );
      H.deselectColumnFromColumnsList(
        PIVOT_TABLE_CARD.name,
        "Product → Category",
      );
      assertDataSourceColumnSelected("Count");
      assertDataSourceColumnSelected("Average of Quantity");
      assertDataSourceColumnSelected("Created At: Year", false);
      assertDataSourceColumnSelected("Product → Category", false);
      H.echartsContainer().should("not.exist");
      H.verticalWell().findAllByTestId("well-item").should("have.length", 2);
      H.horizontalWell().findAllByTestId("well-item").should("have.length", 0);

      // Add a dimension back
      H.dataSourceColumn(PIVOT_TABLE_CARD.name, "Created At: Year").click();
      assertDataSourceColumnSelected("Count");
      assertDataSourceColumnSelected("Average of Quantity");
      assertDataSourceColumnSelected("Created At: Year");
      assertDataSourceColumnSelected("Product → Category", false);
      H.echartsContainer().should("exist");
      H.verticalWell().findAllByTestId("well-item").should("have.length", 2);
      H.horizontalWell().findAllByTestId("well-item").should("have.length", 1);
      H.chartLegendItems().should("have.length", 2);
    });
  });

  it("should support trend lines (metabase #61197)", () => {
    createDashboardWithVisualizerDashcards();
    H.editDashboard();

    H.showDashcardVisualizerModalSettings(0);

    H.modal().within(() => {
      cy.findByText("Trend line").click();
      H.trendLine().should("have.length", 2);
      cy.findByText("Save").click();
    });

    H.getDashboardCard(0).within(() => {
      H.trendLine().should("have.length", 2);
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
        H.selectDataset(Q2_NAME);
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
        H.verticalWell().findAllByTestId("well-item").should("have.length", 2);
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
        H.verticalWell().findAllByTestId("well-item").should("have.length", 1);
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
        H.selectDataset(Q2_NAME);
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
        H.dataSourceColumn(Q2_NAME, "Count").findByLabelText("Remove").click();
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
        H.horizontalWell().within(() => {
          cy.findAllByTestId("well-item")
            .first()
            .findByLabelText("Remove")
            .click();
        });
        H.assertDataSourceColumnSelected(Q1_NAME, "Product → Category", false);
        H.assertDataSourceColumnSelected(Q2_NAME, "Category", false);
        H.chartLegend().should("not.exist");

        // Add all columns back
        H.dataSourceColumn(Q1_NAME, "Count").click();
        H.dataSourceColumn(Q1_NAME, "Product → Category").click();
        H.dataSourceColumn(Q2_NAME, "Count").click();
        H.dataSourceColumn(Q2_NAME, "Category").click();
        H.verticalWell().findAllByTestId("well-item").should("have.length", 2);
        H.horizontalWell()
          .findAllByTestId("well-item")
          .should("have.length", 2);
        H.chartLegendItems().should("have.length", 2);

        // Remove 2nd data source
        H.removeDataSource(Q2_NAME);
        H.dataImporter().within(() => {
          cy.findByText(Q2_NAME).should("not.exist");
          cy.findAllByText("Count").should("have.length", 1);
          cy.findAllByText("Category").should("not.exist");
        });
        H.verticalWell().findAllByTestId("well-item").should("have.length", 1);
        H.horizontalWell()
          .findAllByTestId("well-item")
          .should("have.length", 1);
        H.chartLegend().should("not.exist");
      });
    });

    it("should show only enabled series in the visualizer based on the card's viz settings", () => {
      const visualization_settings = {
        ...ORDERS_COUNT_BY_CREATED_AT_AND_PRODUCT_CATEGORY.visualization_settings,
        "graph.series_order": [
          {
            name: "Gadget",
            enabled: false,
            color: "#F9D45C",
            key: "Gadget",
          },
          {
            key: "Doohickey",
            color: "#88BF4D",
            enabled: true,
            name: "Doohickey",
          },
          {
            key: "Gizmo",
            color: "#A989C5",
            enabled: true,
            name: "Gizmo",
          },
          {
            name: "Widget",
            enabled: false,
            color: "#F2A86F",
            key: "Widget",
          },
        ],
        "graph.series_order_dimension": "CATEGORY",
      };

      H.createDashboardWithQuestions({
        questions: [
          {
            ...ORDERS_COUNT_BY_CREATED_AT_AND_PRODUCT_CATEGORY,
            visualization_settings,
          },
        ],
      }).then(({ dashboard }) => {
        H.visitDashboard(dashboard.id);
      });

      H.getDashboardCard(0)
        .findAllByTestId("legend-item")
        .should("have.length", 2);

      H.editDashboard();
      H.showDashcardVisualizerModal(0, {
        isVisualizerCard: false,
      });

      H.modal().within(() => {
        cy.findAllByTestId("legend-item").should("have.length", 2);
        cy.button("Settings").click();
        cy.findAllByTestId("series-name-input").should("have.length", 2);
      });
    });
  });
});
