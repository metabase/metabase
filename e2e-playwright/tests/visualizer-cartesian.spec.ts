/**
 * Playwright port of
 * e2e/test/scenarios/dashboard/visualizer/cartesian.cy.spec.ts
 *
 * Port notes:
 * - No gating tags upstream; runs on the EE spike backend.
 * - beforeEach creates 13 questions and stores their ids in `ids` (the Cypress
 *   wrapId/@alias mechanism). createDashboardWithVisualizerDashcards takes that
 *   object instead of reading Cypress aliases.
 * - Dropped never-awaited intercepts: @dataset, @cardQuery and @dashcardQuery
 *   are registered upstream but never cy.wait()ed in this spec. The shared
 *   selectDataset helper already waits on the card query internally.
 * - Shared visualizer helpers are imported from support/visualizer-basics.ts;
 *   the extras this spec needs live in support/visualizer-cartesian.ts.
 * - All the `H.modal().within(...)` blocks become scope-parameterised helpers /
 *   modal(page)-scoped locators; chart helpers (chartPathWithFillColor /
 *   trendLine / echartsTextExact) are scoped because the edit-mode dashboard
 *   behind the modal has its own chart-containers.
 * - ECharts axis <text> carries surrounding whitespace (getByText doesn't trim),
 *   so axis-label assertions use echartsTextExact (whitespace-tolerant regex).
 * - goalLine / chartPath paths are zero-extent or symbol markers that Playwright
 *   can call "hidden"; Cypress .should("exist") only checks presence → assert
 *   attachment (toBeAttached) rather than visibility.
 */
import { expect, test } from "../support/fixtures";
import {
  editDashboard,
  getDashboardCard,
  saveDashboard,
  sidebar,
} from "../support/dashboard";
import { visitDashboard } from "../support/ui";
import { icon, modal, popover } from "../support/ui";
import { ORDERS_DASHBOARD_ID } from "../support/sample-data";
import type { Locator, Page } from "@playwright/test";
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
  type VisualizerQuestionIds,
  assertDataSourceColumnSelected,
  assertWellItemsCount,
  clickVisualizeAnotherWay,
  createDashboard,
  createDashboardWithVisualizerDashcards,
  createNativeQuestion,
  createQuestion,
  dataImporter,
  deselectColumnFromColumnsList,
  goalLine,
  horizontalWell,
  openQuestionsSidebar,
  renameEditableText,
  saveDashcardVisualizerModal,
  selectDataset,
  selectVisualization,
  showDashcardVisualizerModal,
  switchToAddMoreData,
  switchToColumnsList,
  verticalWell,
} from "../support/visualizer-basics";
import { createDashboardWithQuestions } from "../support/factories";
import {
  ORDERS_COUNT_BY_CREATED_AT_AND_PRODUCT_CATEGORY,
  PIVOT_TABLE_CARD,
  PRODUCTS_COUNT_BY_CREATED_AT_AND_CATEGORY,
  chartLegend,
  chartLegendItems,
  chartPathWithFillColor,
  dataSource,
  dataSourceColumn,
  echartsTextExact,
  ensureDisplayIsSelected,
  removeDataSource,
  saveDashcardVisualizerModalSettings,
  selectColumnFromColumnsList,
  showDashcardVisualizerModalSettings,
  trendLine,
} from "../support/visualizer-cartesian";

type CartesianIds = VisualizerQuestionIds & {
  ordersCountByCreatedAtAndProductCategoryQuestionId: number;
  productsCountByCreatedAtAndCategoryQuestionId: number;
  productsAverageByCreatedAtQuestionId: number;
  productsCountByCategoryPieQuestionId: number;
};

test.describe("scenarios > dashboard > visualizer > cartesian", () => {
  let ids: CartesianIds;

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();

    const api = mb.api;
    ids = {
      ordersCountByCreatedAtQuestionId: await createQuestion(api, ORDERS_COUNT_BY_CREATED_AT),
      ordersCountByProductCategoryQuestionId: await createQuestion(api, ORDERS_COUNT_BY_PRODUCT_CATEGORY),
      ordersCountByCreatedAtAndProductCategoryQuestionId: await createQuestion(api, ORDERS_COUNT_BY_CREATED_AT_AND_PRODUCT_CATEGORY),
      productsCountByCreatedAtQuestionId: await createQuestion(api, PRODUCTS_COUNT_BY_CREATED_AT),
      productsCountByCreatedAtAndCategoryQuestionId: await createQuestion(api, PRODUCTS_COUNT_BY_CREATED_AT_AND_CATEGORY),
      productsAverageByCreatedAtQuestionId: await createQuestion(api, PRODUCTS_AVERAGE_BY_CREATED_AT),
      productsCountByCategoryQuestionId: await createQuestion(api, PRODUCTS_COUNT_BY_CATEGORY),
      productsCountByCategoryPieQuestionId: await createQuestion(api, PRODUCTS_COUNT_BY_CATEGORY_PIE),
      landingPageViewsScalarQuestionId: await createNativeQuestion(api, SCALAR_CARD.LANDING_PAGE_VIEWS),
      checkoutPageViewsScalarQuestionId: await createNativeQuestion(api, SCALAR_CARD.CHECKOUT_PAGE_VIEWS),
      paymentDonePageViewsScalarQuestionId: await createNativeQuestion(api, SCALAR_CARD.PAYMENT_DONE_PAGE_VIEWS),
      stepColumnQuestionId: await createNativeQuestion(api, STEP_COLUMN_CARD),
      viewsColumnQuestionId: await createNativeQuestion(api, VIEWS_COLUMN_CARD),
    };
  });

  test("should allow to change viz settings", async ({ page, mb }) => {
    const dashboardId = await createDashboardWithVisualizerDashcards(mb.api, ids);
    await visitDashboard(page, mb.api, dashboardId);
    await editDashboard(page);

    await showDashcardVisualizerModalSettings(page, 0);

    const dialog = modal(page);
    await expect(goalLine(dialog)).toHaveCount(0);
    await dialog.getByTestId("chartsettings-sidebar").getByText("Goal line", { exact: true }).click();
    await expect(goalLine(dialog).first()).toBeAttached();

    // Ensure the chart legend contains original series name
    await expect(
      chartLegend(dialog).getByText(PRODUCTS_COUNT_BY_CREATED_AT.name, { exact: true }),
    ).toBeVisible();

    // Edit series settings
    const seriesSettings = dialog.getByTestId("series-settings").first();
    // Update series name
    await renameEditableText(
      seriesSettings.getByTestId("series-name-input").nth(1),
      "Series B",
    );
    // Update series display type
    await icon(seriesSettings, "chevrondown").nth(1).click();
    await icon(seriesSettings, "bar").click();
    // Update series color
    await seriesSettings.getByTestId("color-selector-button").nth(1).click();

    await popover(page).getByLabel("#F9D45C").click();

    const assertUpdatedVizSettingsApplied = async (scope: Locator) => {
      await expect(goalLine(scope).first()).toBeAttached();
      // Ensure the chart legend contains renamed series
      await expect(chartLegend(scope).getByText("Series B", { exact: true })).toBeVisible();
      await expect(
        chartLegend(scope).getByText(PRODUCTS_COUNT_BY_CREATED_AT.name, { exact: true }),
      ).toHaveCount(0);
      await expect(chartPathWithFillColor(scope, "#F9D45C").first()).toBeAttached();
    };

    await assertUpdatedVizSettingsApplied(dialog);

    await saveDashcardVisualizerModalSettings(page);

    await assertUpdatedVizSettingsApplied(getDashboardCard(page, 0));
  });

  test("should work correctly when built from a non-cartesian chart", async ({ page, mb }) => {
    await createQuestion(mb.api, PIVOT_TABLE_CARD);

    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await editDashboard(page);
    await openQuestionsSidebar(page);
    await clickVisualizeAnotherWay(page, PIVOT_TABLE_CARD.name!);

    const dialog = modal(page);

    await switchToAddMoreData(page);
    await selectDataset(page, ORDERS_COUNT_BY_CREATED_AT.name);
    await switchToColumnsList(page);
    // Shouldn't this be automatic though?
    await selectColumnFromColumnsList(page, ORDERS_COUNT_BY_CREATED_AT.name, "Count");

    // VIZ-668 pivot-grouping is an internal column used by the pivot table and
    // shouldn't be shown in the columns list
    await expect(dialog.getByText("pivot-grouping", { exact: true })).toHaveCount(0);

    await expect(verticalWell(page).getByText("Count", { exact: true })).toBeVisible();
    await expect(
      verticalWell(page).getByText(`Count (${ORDERS_COUNT_BY_CREATED_AT.name})`, { exact: true }),
    ).toBeVisible();
    await expect(verticalWell(page).getByTestId("well-item")).toHaveCount(2);

    await expect(horizontalWell(page).getByText("Created At: Year", { exact: true })).toBeVisible();
    await expect(horizontalWell(page).getByTestId("well-item")).toHaveCount(1);

    await expect(chartLegendItems(dialog)).toHaveCount(2);
  });

  test("should work with more than two datasets (VIZ-693)", async ({ page, mb }) => {
    const dashboardId = await createDashboard(mb.api);
    await visitDashboard(page, mb.api, dashboardId);

    await editDashboard(page);
    await openQuestionsSidebar(page);
    await clickVisualizeAnotherWay(page, ORDERS_COUNT_BY_CREATED_AT.name);

    await switchToAddMoreData(page);
    await selectDataset(page, PRODUCTS_AVERAGE_BY_CREATED_AT.name);
    await assertWellItemsCount(page, { vertical: 2 });
    await selectDataset(page, PRODUCTS_COUNT_BY_CREATED_AT.name);
    await assertWellItemsCount(page, { vertical: 3 });

    await saveDashcardVisualizerModal(page, { mode: "create" });
    // Wait for card queries before saving the dashboard
    {
      const card = getDashboardCard(page, 0);
      await expect(card.getByText(PRODUCTS_COUNT_BY_CREATED_AT.name, { exact: true })).toBeVisible();
      await expect(card.getByText("Created At: Month", { exact: true })).toBeVisible();
    }

    await saveDashboard(page);

    // Making sure the card renders after saving the dashboard
    {
      const card = getDashboardCard(page, 0);
      await expect(card.getByText(PRODUCTS_COUNT_BY_CREATED_AT.name, { exact: true })).toBeVisible();
      await expect(card.getByText("Created At: Month", { exact: true })).toBeVisible();
    }
  });

  test("should not drop dimensions when changing viz type to another cartesian chart (VIZ-648)", async ({ page, mb }) => {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await editDashboard(page);
    await openQuestionsSidebar(page);

    await clickVisualizeAnotherWay(page, ORDERS_COUNT_BY_CREATED_AT_AND_PRODUCT_CATEGORY.name!);

    await selectVisualization(page, "area");

    await assertDataSourceColumnSelected(
      page,
      ORDERS_COUNT_BY_CREATED_AT_AND_PRODUCT_CATEGORY.name!,
      "Count",
    );
    await assertDataSourceColumnSelected(
      page,
      ORDERS_COUNT_BY_CREATED_AT_AND_PRODUCT_CATEGORY.name!,
      "Created At: Month",
    );
    await assertDataSourceColumnSelected(
      page,
      ORDERS_COUNT_BY_CREATED_AT_AND_PRODUCT_CATEGORY.name!,
      "Product → Category",
    );
  });

  test("should preserve default colors (VIZ-1211)", async ({ page, mb }) => {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await editDashboard(page);
    await openQuestionsSidebar(page);

    await sidebar(page)
      .getByRole("menuitem", { name: ORDERS_COUNT_BY_PRODUCT_CATEGORY.name, exact: true })
      .click();

    await showDashcardVisualizerModal(page, 1, { isVisualizerCard: false });

    await expect(chartPathWithFillColor(modal(page), "#509EE3")).toHaveCount(4);
  });

  test("should handle implicit viz settings (VIZ-947)", async ({ page, mb }) => {
    const assertPivotColumnSelected = (columnName: string, isSelected = true) =>
      assertDataSourceColumnSelected(page, PIVOT_TABLE_CARD.name!, columnName, isSelected);

    await createQuestion(mb.api, PIVOT_TABLE_CARD);

    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await editDashboard(page);
    await openQuestionsSidebar(page);
    await clickVisualizeAnotherWay(page, PIVOT_TABLE_CARD.name!);

    const dialog = modal(page);

    await assertPivotColumnSelected("Count");
    await assertPivotColumnSelected("Average of Quantity", false);
    await assertPivotColumnSelected("Created At: Year");
    await assertPivotColumnSelected("Product → Category", false);
    await expect(chartPathWithFillColor(dialog, "#509EE3")).toHaveCount(5);
    await expect(verticalWell(page).getByTestId("well-item")).toHaveCount(1);
    await expect(horizontalWell(page).getByTestId("well-item")).toHaveCount(1);

    // Add Category column
    await dataSourceColumn(page, PIVOT_TABLE_CARD.name!, "Product → Category").click();
    await assertPivotColumnSelected("Count");
    await assertPivotColumnSelected("Average of Quantity", false);
    await assertPivotColumnSelected("Created At: Year");
    await assertPivotColumnSelected("Product → Category");
    await expect(chartLegendItems(dialog)).toHaveCount(5);
    await expect(verticalWell(page).getByTestId("well-item")).toHaveCount(1);
    await expect(horizontalWell(page).getByTestId("well-item")).toHaveCount(2);

    // Add Average of Quantity column
    await dataSourceColumn(page, PIVOT_TABLE_CARD.name!, "Average of Quantity").click();
    await assertPivotColumnSelected("Count");
    await assertPivotColumnSelected("Average of Quantity");
    await assertPivotColumnSelected("Created At: Year");
    await assertPivotColumnSelected("Product → Category");
    await expect(chartLegendItems(dialog)).toHaveCount(5);
    await expect(verticalWell(page).getByTestId("well-item")).toHaveCount(2);
    await expect(horizontalWell(page).getByTestId("well-item")).toHaveCount(2);

    // Remove dimensions
    await deselectColumnFromColumnsList(page, PIVOT_TABLE_CARD.name!, "Created At: Year");
    await deselectColumnFromColumnsList(page, PIVOT_TABLE_CARD.name!, "Product → Category");
    await assertPivotColumnSelected("Count");
    await assertPivotColumnSelected("Average of Quantity");
    await assertPivotColumnSelected("Created At: Year", false);
    await assertPivotColumnSelected("Product → Category", false);
    await expect(dialog.getByTestId("chart-container")).toHaveCount(0);
    await expect(verticalWell(page).getByTestId("well-item")).toHaveCount(2);
    await expect(horizontalWell(page).getByTestId("well-item")).toHaveCount(0);

    // Add a dimension back
    await dataSourceColumn(page, PIVOT_TABLE_CARD.name!, "Created At: Year").click();
    await assertPivotColumnSelected("Count");
    await assertPivotColumnSelected("Average of Quantity");
    await assertPivotColumnSelected("Created At: Year");
    await assertPivotColumnSelected("Product → Category", false);
    await expect(dialog.getByTestId("chart-container").first()).toBeAttached();
    await expect(verticalWell(page).getByTestId("well-item")).toHaveCount(2);
    await expect(horizontalWell(page).getByTestId("well-item")).toHaveCount(1);
    await expect(chartLegendItems(dialog)).toHaveCount(2);
  });

  test("should support trend lines (metabase #61197)", async ({ page, mb }) => {
    const dashboardId = await createDashboardWithVisualizerDashcards(mb.api, ids);
    await visitDashboard(page, mb.api, dashboardId);
    await editDashboard(page);

    await showDashcardVisualizerModalSettings(page, 0);

    await modal(page).getByText("Trend line", { exact: true }).click();
    await expect(trendLine(modal(page))).toHaveCount(2);
    await modal(page).getByText("Save", { exact: true }).click();
    await expect(modal(page)).toHaveCount(0);

    await expect(trendLine(getDashboardCard(page, 0))).toHaveCount(2);
  });

  test.describe("timeseries breakout", () => {
    test("should automatically use new columns whenever possible", async ({ page, mb }) => {
      const Q1_NAME = ORDERS_COUNT_BY_CREATED_AT.name;
      const Q2_NAME = PRODUCTS_COUNT_BY_CREATED_AT.name;

      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await editDashboard(page);
      await openQuestionsSidebar(page);

      await clickVisualizeAnotherWay(page, Q1_NAME);

      const dialog = modal(page);

      await switchToAddMoreData(page);
      await selectDataset(page, Q2_NAME);
      await switchToColumnsList(page);

      await expect(verticalWell(page).getByText("Count", { exact: true })).toBeVisible();
      await expect(horizontalWell(page).getByText("Created At: Month", { exact: true })).toBeVisible();

      await ensureDisplayIsSelected(page, "line");

      // x-axis labels
      await expect(echartsTextExact(dialog, "January 2026")).toBeVisible();
      await expect(echartsTextExact(dialog, "January 2029")).toBeVisible();
      // y-axis labels
      await expect(echartsTextExact(dialog, "600")).toBeVisible();
      await expect(echartsTextExact(dialog, "10")).toBeVisible();

      await expect(dataSource(page, Q1_NAME)).toBeVisible();
      await expect(dataSource(page, Q2_NAME)).toBeVisible();
      await assertDataSourceColumnSelected(page, Q1_NAME, "Count");
      await assertDataSourceColumnSelected(page, Q1_NAME, "Created At: Month");
      await assertDataSourceColumnSelected(page, Q2_NAME, "Count");
      await assertDataSourceColumnSelected(page, Q2_NAME, "Created At: Month");
      await expect(chartLegendItems(dialog)).toHaveCount(2);

      // Remove 2nd count column from the data manager
      await deselectColumnFromColumnsList(page, Q2_NAME, "Count");
      await assertDataSourceColumnSelected(page, Q2_NAME, "Count", false);
      await expect(verticalWell(page).getByText(`Count (${Q2_NAME})`, { exact: true })).toHaveCount(0);
      // legend is visible only when there are multiple series
      await expect(chartLegend(dialog)).toHaveCount(0);

      // Add back 2nd count column from the data manager
      await dataSourceColumn(page, Q2_NAME, "Count").click();
      await assertDataSourceColumnSelected(page, Q2_NAME, "Count");
      await expect(verticalWell(page).getByText(`Count (${Q2_NAME})`, { exact: true })).toBeVisible();
      await expect(chartLegendItems(dialog)).toHaveCount(2);

      // Remove all count columns from the well
      await verticalWell(page).getByTestId("well-item").first().getByLabel("Remove").click();
      await verticalWell(page).getByTestId("well-item").getByLabel("Remove").click();

      await assertDataSourceColumnSelected(page, Q1_NAME, "Count", false);
      await assertDataSourceColumnSelected(page, Q2_NAME, "Count", false);
      await expect(chartLegend(dialog)).toHaveCount(0);

      // Remove all "created at" columns from the well
      await horizontalWell(page).getByTestId("well-item").getByLabel("Remove").click();
      await assertDataSourceColumnSelected(page, Q1_NAME, "Created At: Month", false);
      await assertDataSourceColumnSelected(page, Q2_NAME, "Created At: Month", false);
      await expect(chartLegend(dialog)).toHaveCount(0);

      // Add all columns back
      await dataSourceColumn(page, Q1_NAME, "Count").click();
      await dataSourceColumn(page, Q1_NAME, "Created At: Month").click();
      await dataSourceColumn(page, Q2_NAME, "Count").click();
      await dataSourceColumn(page, Q2_NAME, "Created At: Month").click();
      await expect(verticalWell(page).getByTestId("well-item")).toHaveCount(2);
      await expect(horizontalWell(page).getByTestId("well-item")).toHaveCount(1);
      await expect(chartLegendItems(dialog)).toHaveCount(2);

      // Remove 2nd data source
      await removeDataSource(page, Q2_NAME);
      await expect(dataImporter(page).getByText(Q2_NAME, { exact: true })).toHaveCount(0);
      await expect(dataImporter(page).getByText("Count", { exact: true })).toHaveCount(1);
      await expect(dataImporter(page).getByText("Created At: Month", { exact: true })).toHaveCount(1);
      await expect(verticalWell(page).getByTestId("well-item")).toHaveCount(1);
      await expect(horizontalWell(page).getByTestId("well-item")).toHaveCount(1);
      await expect(chartLegend(dialog)).toHaveCount(0);
    });
  });

  test.describe("category breakout", () => {
    test("should automatically use new columns whenever possible", async ({ page, mb }) => {
      const Q1_NAME = ORDERS_COUNT_BY_PRODUCT_CATEGORY.name;
      const Q2_NAME = PRODUCTS_COUNT_BY_CATEGORY.name;

      await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
      await editDashboard(page);
      await openQuestionsSidebar(page);

      await clickVisualizeAnotherWay(page, Q1_NAME);

      const dialog = modal(page);

      await dialog.getByRole("button", { name: "Add more data", exact: true }).click();
      await selectDataset(page, Q2_NAME);
      await dialog.getByRole("button", { name: "Done", exact: true }).click();

      await expect(verticalWell(page).getByText("Count", { exact: true })).toBeVisible();
      await expect(verticalWell(page).getByText(`Count (${Q2_NAME})`, { exact: true })).toBeVisible();
      await expect(horizontalWell(page).getByText("Product → Category", { exact: true })).toBeVisible();

      await expect(dialog.locator('input[value="bar"]')).toBeChecked();

      // x-axis labels
      await expect(echartsTextExact(dialog, "Doohickey")).toBeVisible();
      await expect(echartsTextExact(dialog, "Widget")).toBeVisible();
      // y-axis labels
      await expect(echartsTextExact(dialog, "6,000")).toBeVisible();
      await expect(echartsTextExact(dialog, "1,000")).toBeVisible();

      await expect(dataSource(page, Q1_NAME)).toBeVisible();
      await expect(dataSource(page, Q2_NAME)).toBeVisible();
      await assertDataSourceColumnSelected(page, Q1_NAME, "Count");
      await assertDataSourceColumnSelected(page, Q1_NAME, "Product → Category");
      await assertDataSourceColumnSelected(page, Q2_NAME, "Count");
      await assertDataSourceColumnSelected(page, Q2_NAME, "Category");
      await expect(chartLegendItems(dialog)).toHaveCount(2);

      // Remove 2nd count column from the data manager
      await dataSourceColumn(page, Q2_NAME, "Count").getByLabel("Remove").click();
      await assertDataSourceColumnSelected(page, Q2_NAME, "Count", false);
      await expect(verticalWell(page).getByText(`Count (${Q2_NAME})`, { exact: true })).toHaveCount(0);
      // legend is visible only when there are multiple series
      await expect(chartLegend(dialog)).toHaveCount(0);

      // Add 2nd count column from the data manager
      await dataSourceColumn(page, Q2_NAME, "Count").click();
      await assertDataSourceColumnSelected(page, Q2_NAME, "Count");
      await expect(verticalWell(page).getByText(`Count (${Q2_NAME})`, { exact: true })).toBeVisible();
      await expect(chartLegendItems(dialog)).toHaveCount(2);

      // Remove all count columns from the well
      await verticalWell(page).getByTestId("well-item").first().getByLabel("Remove").click();
      await verticalWell(page).getByTestId("well-item").getByLabel("Remove").click();
      await assertDataSourceColumnSelected(page, Q1_NAME, "Count", false);
      await assertDataSourceColumnSelected(page, Q2_NAME, "Count", false);
      await expect(chartLegend(dialog)).toHaveCount(0);

      // Remove all "category" columns from the well
      await horizontalWell(page).getByTestId("well-item").first().getByLabel("Remove").click();
      await assertDataSourceColumnSelected(page, Q1_NAME, "Product → Category", false);
      await assertDataSourceColumnSelected(page, Q2_NAME, "Category", false);
      await expect(chartLegend(dialog)).toHaveCount(0);

      // Add all columns back
      await dataSourceColumn(page, Q1_NAME, "Count").click();
      await dataSourceColumn(page, Q1_NAME, "Product → Category").click();
      await dataSourceColumn(page, Q2_NAME, "Count").click();
      await dataSourceColumn(page, Q2_NAME, "Category").click();
      await expect(verticalWell(page).getByTestId("well-item")).toHaveCount(2);
      await expect(horizontalWell(page).getByTestId("well-item")).toHaveCount(2);
      await expect(chartLegendItems(dialog)).toHaveCount(2);

      // Remove 2nd data source
      await removeDataSource(page, Q2_NAME);
      await expect(dataImporter(page).getByText(Q2_NAME, { exact: true })).toHaveCount(0);
      await expect(dataImporter(page).getByText("Count", { exact: true })).toHaveCount(1);
      await expect(dataImporter(page).getByText("Category", { exact: true })).toHaveCount(0);
      await expect(verticalWell(page).getByTestId("well-item")).toHaveCount(1);
      await expect(horizontalWell(page).getByTestId("well-item")).toHaveCount(1);
      await expect(chartLegend(dialog)).toHaveCount(0);
    });

    test("should show only enabled series in the visualizer based on the card's viz settings", async ({ page, mb }) => {
      const visualization_settings = {
        ...ORDERS_COUNT_BY_CREATED_AT_AND_PRODUCT_CATEGORY.visualization_settings,
        "graph.series_order": [
          { name: "Gadget", enabled: false, color: "#F9D45C", key: "Gadget" },
          { key: "Doohickey", color: "#88BF4D", enabled: true, name: "Doohickey" },
          { key: "Gizmo", color: "#A989C5", enabled: true, name: "Gizmo" },
          { name: "Widget", enabled: false, color: "#F2A86F", key: "Widget" },
        ],
        "graph.series_order_dimension": "CATEGORY",
      };

      const { dashboard } = await createDashboardWithQuestions(mb.api, {
        questions: [
          {
            ...ORDERS_COUNT_BY_CREATED_AT_AND_PRODUCT_CATEGORY,
            visualization_settings,
          },
        ],
      });
      await visitDashboard(page, mb.api, dashboard.id);

      await expect(getDashboardCard(page, 0).getByTestId("legend-item")).toHaveCount(2);

      await editDashboard(page);
      await showDashcardVisualizerModal(page, 0, { isVisualizerCard: false });

      const dialog = modal(page);
      await expect(dialog.getByTestId("legend-item")).toHaveCount(2);
      await dialog.getByRole("button", { name: "Settings", exact: true }).click();
      await expect(dialog.getByTestId("series-name-input")).toHaveCount(2);
    });
  });
});
