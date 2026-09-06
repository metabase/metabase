/**
 * Playwright port of
 * e2e/test/scenarios/dashboard/visualizer/basics.cy.spec.ts
 *
 * Port notes:
 * - No gating tags upstream; runs on the EE spike backend.
 * - beforeEach creates 11 questions and stores their ids in `ids` (the Cypress
 *   wrapId/@alias mechanism). createDashboardWithVisualizerDashcards takes that
 *   object instead of reading Cypress aliases off `this`.
 * - Dropped never-awaited intercepts: @dataset and @dashcardQuery are registered
 *   upstream but never cy.wait()ed. Only @cardQuery is awaited — ported as
 *   waitForCardQueries (register before the trigger, await after).
 * - GET /api/setting/version-info is stubbed to {} (as upstream) to suppress the
 *   upgrade banner.
 * - EditableText fields (visualizer-title, findByDisplayValue titles) use the
 *   click+select-all+type+blur dance (fill() doesn't mark them dirty).
 * - The visualizer builds multi-series charts via "Add more data" / selectDataset
 *   (swap-dataset-button), NOT drag/drop — no dnd helpers needed here.
 * - Public sharing + static embedding are enabled by the default snapshot
 *   (default.cy.snap.js), so no extra setup for the sharing/embedding describe.
 */
import { expect, test } from "../support/fixtures";
import { editDashboard, getDashboardCard, saveDashboard } from "../support/dashboard";
import { getDashboardCardMenu, icon } from "../support/dashboard-cards";
import { createNewTab, deleteTab } from "../support/dashboard-core";
import { visitDashboard } from "../support/ui";
import { modal, popover } from "../support/ui";
import { tooltip } from "../support/charts";
import { visitEmbeddedPage } from "../support/embedding-dashboard";
import { ORDERS_DASHBOARD_ID, SAMPLE_DB_ID } from "../support/sample-data";
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
  addQuestionToDashboard,
  assertCurrentVisualization,
  assertDashboardCardTitle,
  assertDataSourceColumnSelected,
  assertWellItems,
  assertWellItemsCount,
  chartGridLines,
  clickOnCardTitle,
  clickVisualizeAnotherWay,
  createDashboard,
  createDashboardWithVisualizerDashcards,
  createNativeQuestion,
  createNativeQuestionAndDashboard,
  createPublicDashboardLink,
  createQuestion,
  dataImporter,
  deselectColumnFromColumnsList,
  goalLine,
  horizontalWell,
  openQuestionsSidebar,
  renameEditableText,
  resetDataSourceButton,
  saveDashcardVisualizerModal,
  selectDataset,
  selectVisualization,
  showDashcardVisualizerModal,
  showUnderlyingQuestion,
  switchToAddMoreData,
  switchToColumnsList,
  verticalWell,
  waitForCardQueries,
} from "../support/visualizer-basics";

// See upstream: editing a dashcard before it finishes loading can leave the
// visualizer modal in an error state.
const DASHCARD_QUERY_WAIT_TIME = 1000;

test.describe("scenarios > dashboard > visualizer > basics", () => {
  let ids: VisualizerQuestionIds & {
    productsAverageByCreatedAtQuestionId: number;
    productsCountByCategoryPieQuestionId: number;
  };

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();

    await page.route("**/api/setting/version-info", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
    );

    await mb.signInAsNormalUser();

    const api = mb.api;
    ids = {
      ordersCountByCreatedAtQuestionId: await createQuestion(api, ORDERS_COUNT_BY_CREATED_AT),
      ordersCountByProductCategoryQuestionId: await createQuestion(api, ORDERS_COUNT_BY_PRODUCT_CATEGORY),
      productsAverageByCreatedAtQuestionId: await createQuestion(api, PRODUCTS_AVERAGE_BY_CREATED_AT),
      productsCountByCreatedAtQuestionId: await createQuestion(api, PRODUCTS_COUNT_BY_CREATED_AT),
      productsCountByCategoryQuestionId: await createQuestion(api, PRODUCTS_COUNT_BY_CATEGORY),
      productsCountByCategoryPieQuestionId: await createQuestion(api, PRODUCTS_COUNT_BY_CATEGORY_PIE),
      landingPageViewsScalarQuestionId: await createNativeQuestion(api, SCALAR_CARD.LANDING_PAGE_VIEWS),
      checkoutPageViewsScalarQuestionId: await createNativeQuestion(api, SCALAR_CARD.CHECKOUT_PAGE_VIEWS),
      paymentDonePageViewsScalarQuestionId: await createNativeQuestion(api, SCALAR_CARD.PAYMENT_DONE_PAGE_VIEWS),
      stepColumnQuestionId: await createNativeQuestion(api, STEP_COLUMN_CARD),
      viewsColumnQuestionId: await createNativeQuestion(api, VIEWS_COLUMN_CARD),
    };
  });

  test("should create and update a dashcard with 'Visualize another way' button", async ({ page, mb }) => {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);

    await editDashboard(page);
    await openQuestionsSidebar(page);
    await clickVisualizeAnotherWay(page, ORDERS_COUNT_BY_CREATED_AT.name);

    await expect(verticalWell(page).getByText("Count", { exact: true })).toBeVisible();
    await expect(horizontalWell(page).getByText("Created At: Month", { exact: true })).toBeVisible();
    await expect(modal(page).locator('input[value="line"]')).toBeChecked();
    await modal(page).getByRole("button", { name: "Add to dashboard", exact: true }).click();
    await expect(modal(page)).toHaveCount(0);

    {
      const card = getDashboardCard(page, 1);
      await expect(card.getByText(ORDERS_COUNT_BY_CREATED_AT.name, { exact: true })).toBeVisible();
      await expect(card.getByText("Count", { exact: true })).toBeVisible();
      await expect(card.getByText("Created At: Month", { exact: true })).toBeVisible();
    }

    await showDashcardVisualizerModal(page, 1);

    await modal(page).getByRole("button", { name: "Add more data", exact: true }).click();
    const search = page.getByPlaceholder("Search for something");
    await search.click();
    await search.pressSequentially("Cre");

    {
      const cardQuery = waitForCardQueries(page, 1);
      await dataImporter(page).getByText(PRODUCTS_COUNT_BY_CREATED_AT.name, { exact: true }).first().click();
      await cardQuery;
    }

    await assertWellItems(page, {
      vertical: ["Count", "Count (Products by Created At (Month))"],
      horizontal: ["Created At: Month"],
    });

    await saveDashcardVisualizerModal(page);

    {
      const card = getDashboardCard(page, 1);
      await expect(card.getByText(ORDERS_COUNT_BY_CREATED_AT.name, { exact: true }).first()).toBeVisible();
      await expect(card.getByText(PRODUCTS_COUNT_BY_CREATED_AT.name, { exact: true }).first()).toBeVisible();
      await expect(card.getByText("Created At: Month", { exact: true })).toBeVisible();
    }

    await saveDashboard(page);

    {
      const card = getDashboardCard(page, 1);
      await expect(card.getByText(ORDERS_COUNT_BY_CREATED_AT.name, { exact: true }).first()).toBeVisible();
      await expect(card.getByText(PRODUCTS_COUNT_BY_CREATED_AT.name, { exact: true }).first()).toBeVisible();
      await expect(card.getByText("Created At: Month", { exact: true })).toBeVisible();
    }
  });

  test("should update an existing dashcard with visualizer", async ({ page, mb }) => {
    await addQuestionToDashboard(mb.api, {
      dashboardId: ORDERS_DASHBOARD_ID,
      cardId: ids.ordersCountByCreatedAtQuestionId,
    });
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await editDashboard(page);

    await showDashcardVisualizerModal(page, 1, { isVisualizerCard: false });

    await modal(page).getByRole("button", { name: "Add more data", exact: true }).click();
    await selectDataset(page, PRODUCTS_COUNT_BY_CREATED_AT.name);

    {
      const canvas = modal(page).getByTestId("visualization-canvas");
      await expect(canvas.getByText(`Count (${PRODUCTS_COUNT_BY_CREATED_AT.name})`, { exact: true })).toBeVisible();
      await expect(canvas.getByText("Created At: Month", { exact: true }).first()).toBeVisible();
    }
    await expect(
      modal(page).getByTestId("visualizer-header").getByText(ORDERS_COUNT_BY_CREATED_AT.name, { exact: true }),
    ).toBeVisible();

    await saveDashcardVisualizerModal(page);

    {
      const chart = getDashboardCard(page, 1).getByTestId("chart-container");
      await expect(chart.getByText(ORDERS_COUNT_BY_CREATED_AT.name, { exact: true })).toBeVisible();
      await expect(chart.getByText(PRODUCTS_COUNT_BY_CREATED_AT.name, { exact: true })).toBeVisible();
      await expect(chart.getByText("Created At: Month", { exact: true }).first()).toBeVisible();
    }

    await saveDashboard(page);

    {
      const chart = getDashboardCard(page, 1).getByTestId("chart-container");
      await expect(chart.getByText(ORDERS_COUNT_BY_CREATED_AT.name, { exact: true })).toBeVisible();
      await expect(chart.getByText(PRODUCTS_COUNT_BY_CREATED_AT.name, { exact: true })).toBeVisible();
      await expect(chart.getByText("Created At: Month", { exact: true }).first()).toBeVisible();
    }
  });

  test("should allow to visualize an existing dashcard another way if its viz type isn't supported by visualizer", async ({ page, mb }) => {
    const dashCard = () => getDashboardCard(page, 0);

    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await editDashboard(page);

    await dashCard().hover();
    await dashCard().getByLabel("Visualize another way").click({ force: true });
    await expect(modal(page).getByTestId("visualization-canvas-loader")).toHaveCount(0);

    await assertDataSourceColumnSelected(page, "Orders", "ID");
    await assertDataSourceColumnSelected(page, "Orders", "Subtotal");
    await expect(verticalWell(page).getByTestId("well-item")).toHaveCount(1);
    await expect(horizontalWell(page).getByTestId("well-item")).toHaveCount(1);
    await assertCurrentVisualization(page, "bar");
    await modal(page).getByRole("button", { name: "Save", exact: true }).click();
    await expect(modal(page)).toHaveCount(0);

    {
      const chart = dashCard().getByTestId("chart-container");
      await expect(chart.getByText("Subtotal", { exact: true })).toBeVisible();
      await expect(chart.getByText("ID", { exact: true })).toBeVisible();
    }

    await dashCard().hover();
    await expect(dashCard().getByLabel("Visualize another way")).toHaveCount(0);
    await dashCard().hover();
    await expect(dashCard().getByLabel("Show visualization options")).toHaveCount(0);
    await dashCard().hover();
    await dashCard().getByLabel("Edit visualization").click({ force: true });

    await expect(modal(page).getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  });

  test("should allow clicking on the title", async ({ page, mb }) => {
    const dashboardId = await createDashboardWithVisualizerDashcards(mb.api, ids);
    await visitDashboard(page, mb.api, dashboardId);

    await expect(page.getByTestId("loading-indicator")).toHaveCount(0);
    // chartGridLines are zero-height <path>s → Playwright calls them "hidden";
    // Cypress .should("exist") only checks presence, so assert attachment.
    await expect(chartGridLines(getDashboardCard(page, 0)).first()).toBeAttached();

    // Series 1
    await showUnderlyingQuestion(page, 0, ORDERS_COUNT_BY_CREATED_AT.name);
    await expect(page).toHaveURL(
      new RegExp(`${ids.ordersCountByCreatedAtQuestionId}-orders-by-created-at-month`),
    );
    await page.getByLabel("Back to Test Dashboard").click();
    // Series 2
    await showUnderlyingQuestion(page, 0, PRODUCTS_COUNT_BY_CREATED_AT.name);
    await expect(page).toHaveURL(
      new RegExp(`${ids.productsCountByCreatedAtQuestionId}-products-by-created-at-month`),
    );
    await page.getByLabel("Back to Test Dashboard").click();

    // Third chart (pie, single series)
    await clickOnCardTitle(page, 2);
    await expect(page).toHaveURL(
      new RegExp(`${ids.productsCountByCategoryQuestionId}-products-by-category`),
    );
    await page.getByLabel("Back to Test Dashboard").click();

    // Fifth chart (funnel)
    await showUnderlyingQuestion(page, 4, STEP_COLUMN_CARD.name);
    await expect(page).toHaveURL(new RegExp(`${ids.stepColumnQuestionId}-step-column`));
    await page.getByLabel("Back to Test Dashboard").click();
  });

  test("should open underlying questions in the ellipsis menu if the card has no title", async ({ page, mb }) => {
    const dashboardId = await createDashboardWithVisualizerDashcards(mb.api, ids);
    await visitDashboard(page, mb.api, dashboardId);

    // This card HAS a title → NO "View question(s)" option
    await getDashboardCard(page, 0).hover();
    await (await getDashboardCardMenu(page, 0)).click();
    await expect(popover(page)).toBeVisible();
    await expect(popover(page).getByText("View question(s)", { exact: true })).toHaveCount(0);

    // This card has NO title → SHOULD have the option
    await editDashboard(page);
    await showDashcardVisualizerModal(page, 2);
    await renameEditableText(modal(page).getByTestId("visualizer-title"), "");
    await saveDashcardVisualizerModal(page);
    await page.waitForTimeout(DASHCARD_QUERY_WAIT_TIME);
    await saveDashboard(page);

    await getDashboardCard(page, 2).hover();
    await (await getDashboardCardMenu(page, 2)).click();
    await expect(popover(page).getByText("View question(s)", { exact: true })).toBeVisible();
    await popover(page).getByText("View question(s)", { exact: true }).hover();

    await page
      .getByTestId("dashcard-menu-open-underlying-question")
      .getByText(PRODUCTS_COUNT_BY_CATEGORY.name, { exact: true })
      .click();

    await expect(page).toHaveURL(
      new RegExp(`${ids.productsCountByCategoryQuestionId}-products-by-category`),
    );
  });

  test("should rename a dashboard card", async ({ page, mb }) => {
    const dashboardId = await createDashboardWithVisualizerDashcards(mb.api, ids);
    await visitDashboard(page, mb.api, dashboardId);
    await editDashboard(page);

    // My chart -> "Renamed chart" (findByDisplayValue targets the visualizer-title)
    await showDashcardVisualizerModal(page, 0);
    await expect(modal(page).getByTestId("visualizer-title")).toHaveValue("My chart");
    await renameEditableText(modal(page).getByTestId("visualizer-title"), "Renamed chart");
    await saveDashcardVisualizerModal(page);
    await expect(getDashboardCard(page, 0).getByText("Created At: Month", { exact: true })).toBeVisible();
    await assertDashboardCardTitle(page, 0, "Renamed chart");

    // PRODUCTS_COUNT_BY_CREATED_AT.name -> "Another chart"
    await showDashcardVisualizerModal(page, 3, { isVisualizerCard: false });
    await expect(modal(page).getByTestId("visualizer-title")).toHaveValue(
      PRODUCTS_COUNT_BY_CREATED_AT.name,
    );
    await renameEditableText(modal(page).getByTestId("visualizer-title"), "Another chart");
    await saveDashcardVisualizerModal(page);
    await expect(getDashboardCard(page, 3).getByText("Created At: Month", { exact: true })).toBeVisible();
    await assertDashboardCardTitle(page, 3, "Another chart");

    // My category chart -> ""
    await showDashcardVisualizerModal(page, 1);
    await renameEditableText(modal(page).getByTestId("visualizer-title"), "");
    await saveDashcardVisualizerModal(page);
    await expect(getDashboardCard(page, 1).getByText("Product → Category", { exact: true })).toBeVisible();
    await assertDashboardCardTitle(page, 1, "");

    await saveDashboard(page);

    await assertDashboardCardTitle(page, 0, "Renamed chart");
    await assertDashboardCardTitle(page, 1, "");
    await assertDashboardCardTitle(page, 3, "Another chart");

    // Making sure the title is empty (not "My new visualization")
    await editDashboard(page);
    await showDashcardVisualizerModal(page, 1);
    await expect(modal(page).getByTestId("visualizer-title")).toHaveText("");
  });

  test("should allow adding description to a visualizer dashcard (metabase#61457)", async ({ page, mb }) => {
    const dashboardId = await createDashboardWithVisualizerDashcards(mb.api, ids);
    await visitDashboard(page, mb.api, dashboardId);
    await editDashboard(page);

    await showDashcardVisualizerModal(page, 0);
    await modal(page).getByText("Settings", { exact: true }).click();
    await expect(modal(page).getByTestId("card.description")).toHaveValue("");
    await typeIntoDescription(page, "My description");

    await saveDashcardVisualizerModal(page);
    await saveDashboard(page);

    await getDashboardCard(page, 0).hover();
    await icon(getDashboardCard(page, 0), "info").hover();
    await expect(tooltip(page).getByText("My description", { exact: true })).toBeVisible();
  });

  test("should allow drilling into the underlying question by clicking on the title (metabase#64340)", async ({ page, mb }) => {
    const questionId = await createQuestion(mb.api, ORDERS_COUNT_BY_CREATED_AT);
    const dashboardId = await createDashboard(mb.api);
    await addQuestionToDashboard(mb.api, { dashboardId, cardId: questionId });
    await visitDashboard(page, mb.api, dashboardId);

    await editDashboard(page);
    await getDashboardCard(page, 0).hover();
    await getDashboardCard(page, 0).getByLabel("Visualize another way").click({ force: true });

    await selectVisualization(page, "bar");
    await saveDashcardVisualizerModal(page);
    await saveDashboard(page);

    await getDashboardCard(page, 0).getByText("Orders by Created At (Month)", { exact: true }).click();

    await expect(page).toHaveURL(/\/question\/\d+/);
  });

  test("should propagate original card title and description to visualizer cards (metabase#63863)", async ({ page, mb }) => {
    const questionId = await createQuestion(mb.api, {
      ...ORDERS_COUNT_BY_CREATED_AT,
      name: "Original Question Title",
      description: "Original question description",
    });

    const dashboardId = await createDashboard(mb.api);
    await addQuestionToDashboard(mb.api, { dashboardId, cardId: questionId });
    await visitDashboard(page, mb.api, dashboardId);

    await expect(getDashboardCard(page, 0).getByText("Original Question Title", { exact: true })).toBeVisible();

    await getDashboardCard(page, 0).hover();
    await icon(getDashboardCard(page, 0), "info").hover();
    await expect(tooltip(page).getByText("Original question description", { exact: true })).toBeVisible();

    await editDashboard(page);
    await getDashboardCard(page, 0).hover();
    await getDashboardCard(page, 0).getByLabel("Visualize another way").click({ force: true });

    await expect(modal(page).getByTestId("visualizer-title")).toHaveValue("Original Question Title");
    await modal(page).getByText("Settings", { exact: true }).click();
    await expect(modal(page).getByTestId("card.description")).toHaveValue("Original question description");
    await selectVisualization(page, "bar");

    await saveDashcardVisualizerModal(page);
    await saveDashboard(page);

    await expect(getDashboardCard(page, 0).getByText("Original Question Title", { exact: true })).toBeVisible();

    await getDashboardCard(page, 0).hover();
    await icon(getDashboardCard(page, 0), "info").hover();
    await expect(tooltip(page).getByText("Original question description", { exact: true })).toBeVisible();

    await editDashboard(page);

    await showDashcardVisualizerModal(page, 0);
    await expect(modal(page).getByTestId("visualizer-title")).toHaveValue("Original Question Title");
    await modal(page).getByText("Settings", { exact: true }).click();
    await expect(modal(page).getByTestId("card.description")).toHaveValue("Original question description");

    await renameEditableText(modal(page).getByTestId("visualizer-title"), "Updated Title");
    await typeIntoDescription(page, "Updated description", { clear: true });

    await saveDashcardVisualizerModal(page);
    await saveDashboard(page);

    await expect(getDashboardCard(page, 0).getByText("Updated Title", { exact: true })).toBeVisible();

    await getDashboardCard(page, 0).hover();
    await icon(getDashboardCard(page, 0), "info").hover();
    await expect(tooltip(page).getByText("Updated description", { exact: true })).toBeVisible();
  });

  test("should start in a pristine state and update dirtyness accordingly", async ({ page, mb }) => {
    const dashboardId = await createDashboardWithVisualizerDashcards(mb.api, ids);
    await visitDashboard(page, mb.api, dashboardId);
    await editDashboard(page);

    await showDashcardVisualizerModal(page, 0);

    // no changes, save button should be disabled
    await expect(modal(page).getByRole("button", { name: "Save", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(modal(page)).toHaveCount(0);

    // change the visualization type, save button should be enabled
    await showDashcardVisualizerModal(page, 0);
    await selectVisualization(page, "bar");
    await expect(modal(page).getByRole("button", { name: "Save", exact: true })).not.toBeDisabled();
  });

  test("should allow navigating through change history", async ({ page, mb }) => {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);

    await editDashboard(page);
    await openQuestionsSidebar(page);
    await clickVisualizeAnotherWay(page, ORDERS_COUNT_BY_CREATED_AT.name);

    const undoButton = modal(page).getByLabel("Undo", { exact: true });
    const redoButton = modal(page).getByLabel("Redo", { exact: true });

    await expect(undoButton).toBeDisabled();
    await expect(redoButton).toBeDisabled();

    await switchToAddMoreData(page);
    await selectDataset(page, PRODUCTS_COUNT_BY_CREATED_AT.name);
    await switchToColumnsList(page);

    // Undo adding a new data source
    await expect(redoButton).toBeDisabled();
    await undoButton.click();
    await expect(undoButton).toBeDisabled();

    await expect(dataImporter(page).getByText(ORDERS_COUNT_BY_CREATED_AT.name, { exact: true })).toBeVisible();
    await expect(dataImporter(page).getByText(PRODUCTS_COUNT_BY_CREATED_AT.name, { exact: true })).toHaveCount(0);
    await expect(verticalWell(page).getByTestId("well-item")).toHaveCount(1);

    // Redo adding a new data source
    await redoButton.click();
    await expect(redoButton).toBeDisabled();

    await expect(dataImporter(page).getByText(ORDERS_COUNT_BY_CREATED_AT.name, { exact: true })).toBeVisible();
    await expect(dataImporter(page).getByText(PRODUCTS_COUNT_BY_CREATED_AT.name, { exact: true })).toBeVisible();
    await expect(verticalWell(page).getByTestId("well-item")).toHaveCount(2);

    // Remove a column
    await deselectColumnFromColumnsList(page, PRODUCTS_COUNT_BY_CREATED_AT.name, "Count");

    // Undo removing a column
    await expect(redoButton).toBeDisabled();
    await undoButton.click();
    await expect(verticalWell(page).getByTestId("well-item")).toHaveCount(2);

    // Redo removing a column
    await redoButton.click();
    await expect(redoButton).toBeDisabled();
    await expect(verticalWell(page).getByTestId("well-item")).toHaveCount(1);

    // Change viz settings (add goal line)
    await modal(page).getByText("Settings", { exact: true }).click();
    await modal(page).getByTestId("chartsettings-sidebar").getByText("Goal line", { exact: true }).click();
    await expect(goalLine(modal(page)).first()).toBeAttached();

    // Undo goal line
    await undoButton.click();
    await expect(goalLine(modal(page))).toHaveCount(0);

    // Ensure UI state isn't tracked in history
    await expect(modal(page).getByTestId("chartsettings-sidebar")).toBeVisible();

    // Redo goal line
    await redoButton.click();
    await expect(goalLine(modal(page)).first()).toBeAttached();

    await modal(page).getByRole("button", { name: "Add to dashboard", exact: true }).click();
    await expect(modal(page)).toHaveCount(0);

    await page.waitForTimeout(DASHCARD_QUERY_WAIT_TIME);

    // Ensure history set is reset
    await showDashcardVisualizerModal(page, 1);

    await expect(modal(page).getByLabel("Undo", { exact: true })).toBeDisabled();
    await expect(modal(page).getByLabel("Redo", { exact: true })).toBeDisabled();
    // Closed, the settings sidebar sits in a zero-width overflow:hidden grid
    // column — its content div keeps min-width:320 (Playwright calls it
    // "visible") but is clipped out of view. Cypress not.be.visible catches the
    // clipping; the Playwright equivalent is not.toBeInViewport (see PORTING).
    await expect(modal(page).getByTestId("chartsettings-sidebar")).not.toBeInViewport();
  });

  test("should replace a dataset without remembering removing the current ones (metabase#57897)", async ({ page, mb }) => {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);

    await editDashboard(page);
    await openQuestionsSidebar(page);
    await clickVisualizeAnotherWay(page, ORDERS_COUNT_BY_CREATED_AT.name);

    const undoButton = modal(page).getByLabel("Undo", { exact: true });
    const redoButton = modal(page).getByLabel("Redo", { exact: true });
    await expect(undoButton).toBeDisabled();
    await expect(redoButton).toBeDisabled();

    await switchToAddMoreData(page);
    await selectDataset(page, PRODUCTS_COUNT_BY_CREATED_AT.name);
    await assertWellItems(page, {
      vertical: ["Count", "Count (Products by Created At (Month))"],
    });

    await selectDataset(page, PRODUCTS_AVERAGE_BY_CREATED_AT.name);
    await assertWellItems(page, {
      vertical: ["Count", "Count (Products by Created At (Month))", "Average of Price"],
    });
  });

  test("should add the proper tabId to a new card", async ({ page, mb }) => {
    const dashboardId = await createDashboard(mb.api);
    await visitDashboard(page, mb.api, dashboardId);

    await editDashboard(page);
    await createNewTab(page);
    await saveDashboard(page);

    await editDashboard(page);
    // delete the first tab so it defaults to the second tab
    await deleteTab(page, "Tab 1");
    await saveDashboard(page);

    await editDashboard(page);
    await openQuestionsSidebar(page);

    {
      const cardQuery = waitForCardQueries(page, 1);
      await clickVisualizeAnotherWay(page, ORDERS_COUNT_BY_CREATED_AT.name);
      await cardQuery;
    }
    await modal(page).getByText("Add to dashboard", { exact: true }).click({ force: true });
    await expect(modal(page)).toHaveCount(0);

    await saveDashboard(page);

    await expect(
      getDashboardCard(page, 0).getByText(ORDERS_COUNT_BY_CREATED_AT.name, { exact: true }),
    ).toBeVisible();
  });

  test("should allow adding a dataset after a card is created (VIZ-926)", async ({ page, mb }) => {
    const dashboardId = await createDashboard(mb.api);
    await visitDashboard(page, mb.api, dashboardId);

    await editDashboard(page);

    await openQuestionsSidebar(page);
    await clickVisualizeAnotherWay(page, ORDERS_COUNT_BY_CREATED_AT.name);

    {
      const cardQuery = waitForCardQueries(page, 1);
      await saveDashcardVisualizerModal(page, { mode: "create" });
      await cardQuery;
    }
    await expect(getDashboardCard(page, 0).getByText(ORDERS_COUNT_BY_CREATED_AT.name, { exact: true })).toBeVisible();
    await expect(getDashboardCard(page, 0).getByText("Created At: Month", { exact: true })).toBeVisible();
    await saveDashboard(page);

    await editDashboard(page);
    await showDashcardVisualizerModal(page, 0);
    await switchToAddMoreData(page);
    await selectDataset(page, PRODUCTS_COUNT_BY_CREATED_AT.name);
    await assertWellItemsCount(page, { vertical: 2 });

    // Upstream waits for two @cardQuery after save; on the jar the dashboard
    // re-render fires them via the dashcard endpoint, so gate on the render
    // (toHaveCount below auto-retries) rather than a card-query counter that
    // never reaches 2.
    await saveDashcardVisualizerModal(page);
    // Dashcard title, legend and y-axis label
    await expect(getDashboardCard(page, 0).getByText(ORDERS_COUNT_BY_CREATED_AT.name, { exact: true })).toHaveCount(3);
    // Legend and y-axis label
    await expect(getDashboardCard(page, 0).getByText(PRODUCTS_COUNT_BY_CREATED_AT.name, { exact: true })).toHaveCount(2);
    await expect(getDashboardCard(page, 0).getByText("Created At: Month", { exact: true })).toBeVisible();
    await saveDashboard(page);

    // Making sure the card renders
    await expect(getDashboardCard(page, 0).getByText(ORDERS_COUNT_BY_CREATED_AT.name, { exact: true })).toHaveCount(3);
    await expect(getDashboardCard(page, 0).getByText(PRODUCTS_COUNT_BY_CREATED_AT.name, { exact: true })).toHaveCount(2);
    await expect(getDashboardCard(page, 0).getByText("Created At: Month", { exact: true })).toBeVisible();
  });

  test("should not store all computed settings in visualizer settings (VIZ-905)", async ({ page, mb }) => {
    const dashboardId = await createDashboard(mb.api);
    await visitDashboard(page, mb.api, dashboardId);

    await editDashboard(page);

    await openQuestionsSidebar(page);
    await clickVisualizeAnotherWay(page, ORDERS_COUNT_BY_CREATED_AT.name);
    await switchToAddMoreData(page);
    await selectDataset(page, "Products by Created At (Month)");
    await assertWellItems(page, {
      vertical: ["Count", "Count (Products by Created At (Month))"],
    });
    await saveDashcardVisualizerModal(page, { mode: "create" });
    await saveDashboard(page);

    const dashboardLoad = page.waitForResponse(
      (response) => new URL(response.url()).pathname === `/api/dashboard/${dashboardId}`,
    );
    await page.reload();
    const response = await dashboardLoad;
    const body = await response.json();
    const visualizerSettings =
      body?.dashcards[0]?.visualization_settings?.visualization?.settings;

    expect(Object.keys(visualizerSettings)).toHaveLength(2);
    expect(visualizerSettings).toEqual({
      "graph.dimensions": ["COLUMN_1", "COLUMN_4"],
      "graph.metrics": ["COLUMN_2", "COLUMN_3"],
    });
  });

  test("should allow editing a dashcard when added series are broken (metabase#22265, VIZ-676)", async ({ page, mb }) => {
    const baseQuestion = {
      name: "Base question",
      display: "scalar",
      native: { query: "SELECT 1" },
    };
    const invalidQuestion = {
      name: "Invalid question",
      display: "scalar",
      native: { query: "SELECT 1" },
    };

    const invalidQuestionId = await createNativeQuestion(mb.api, invalidQuestion);

    const { id, card_id, dashboard_id } = await createNativeQuestionAndDashboard(mb.api, {
      questionDetails: baseQuestion,
    });
    await mb.api.put(`/api/dashboard/${dashboard_id}`, {
      dashcards: [{ id, card_id, row: 0, col: 0, size_x: 16, size_y: 10 }],
    });
    await visitDashboard(page, mb.api, dashboard_id);

    await editDashboard(page);
    await getDashboardCard(page, 0).hover();
    await getDashboardCard(page, 0).getByLabel("Visualize another way").click({ force: true });

    let queryMetadataCount = 0;
    const queryMetadataHandler = (response: import("@playwright/test").Response) => {
      if (
        response.request().method() === "GET" &&
        /^\/api\/card\/\d+\/query_metadata$/.test(new URL(response.url()).pathname)
      ) {
        queryMetadataCount += 1;
      }
    };
    page.on("response", queryMetadataHandler);

    await switchToAddMoreData(page);
    await selectDataset(page, invalidQuestion.name);
    await expect(modal(page).getByTestId("funnel-chart")).toContainText("Invalid question");
    await modal(page).getByRole("button", { name: "Save", exact: true }).click();
    await expect(modal(page)).toHaveCount(0);

    await expect.poll(() => queryMetadataCount).toBe(2);
    page.off("response", queryMetadataHandler);
    await expect(getDashboardCard(page, 0)).toContainText("Invalid question");

    await saveDashboard(page);

    // Update 2nd question so that it's broken
    await mb.api.put(`/api/card/${invalidQuestionId}`, {
      dataset_query: {
        type: "native",
        database: SAMPLE_DB_ID,
        native: { query: "SELECT --2", "template-tags": {} },
      },
    });

    await visitDashboard(page, mb.api, dashboard_id);
    await editDashboard(page);

    {
      const card = getDashboardCard(page, 0);
      // dashcard title + the funnel itself
      await expect(card.getByText(baseQuestion.name, { exact: true })).toHaveCount(2);
      await expect(card.getByText(invalidQuestion.name, { exact: true })).toBeVisible();
      await expect(card.getByText("1", { exact: true })).toBeVisible();
    }

    await getDashboardCard(page, 0).hover();
    await getDashboardCard(page, 0).getByLabel("Edit visualization").click({ force: true });
    await expect(dataImporter(page).getByText(baseQuestion.name, { exact: true })).toBeVisible();
    await expect(dataImporter(page).getByText(invalidQuestion.name, { exact: true })).toBeVisible();
  });

  test.describe("public sharing and embedding", () => {
    async function ensureVisualizerCardsAreRendered(page: import("@playwright/test").Page) {
      // Checks a cartesian chart has an axis name
      await expect(
        getDashboardCard(page, 0)
          .getByTestId("chart-container")
          .getByText(ORDERS_COUNT_BY_CREATED_AT.name, { exact: true }),
      ).toBeVisible();

      // Checks a funnel has a step name
      const checkoutStep = getDashboardCard(page, 5).getByText("Checkout Page", { exact: true });
      await checkoutStep.scrollIntoViewIfNeeded();
      await expect(checkoutStep).toBeVisible();
    }

    test("visualizer cards should work in public dashboards", async ({ page, mb }) => {
      await mb.signInAsAdmin();
      const dashboardId = await createDashboardWithVisualizerDashcards(mb.api, ids);
      const uuid = await createPublicDashboardLink(mb.api, dashboardId);
      await page.goto(`/public/dashboard/${uuid}`);

      await ensureVisualizerCardsAreRendered(page);
    });

    test("visualizer cards should work in embedded dashboards", async ({ page, mb }) => {
      await mb.signInAsAdmin();
      const dashboardId = await createDashboardWithVisualizerDashcards(mb.api, ids, {
        enable_embedding: true,
      });

      await visitEmbeddedPage(page, mb, {
        resource: { dashboard: dashboardId },
        params: {},
      });

      await ensureVisualizerCardsAreRendered(page);
    });
  });

  test("show a message when there are no search results", async ({ page, mb }) => {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await editDashboard(page);
    await openQuestionsSidebar(page);
    await clickVisualizeAnotherWay(page, ORDERS_COUNT_BY_CREATED_AT.name);

    await modal(page).getByText("Add more data", { exact: true }).click();
    const search = page.getByPlaceholder("Search for something");
    await search.click();
    await search.pressSequentially("non-existing");

    await expect(modal(page).getByText("No compatible results", { exact: true })).toBeVisible();
  });

  test("should reset a dataset", async ({ page, mb }) => {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await editDashboard(page);
    await openQuestionsSidebar(page);
    await clickVisualizeAnotherWay(page, ORDERS_COUNT_BY_CREATED_AT.name);

    {
      const cardQuery = waitForCardQueries(page, 1);
      await modal(page).getByText("Add to dashboard", { exact: true }).click();
      await expect(modal(page)).toHaveCount(0);
      await cardQuery;
    }

    {
      const card = getDashboardCard(page, 1);
      await expect(card.getByText(ORDERS_COUNT_BY_CREATED_AT.name, { exact: true })).toBeVisible();
      await expect(card.getByText("Created At: Month", { exact: true })).toBeVisible();
    }

    await showDashcardVisualizerModal(page, 1);
    await selectVisualization(page, "pie");
    await assertWellItems(page, {
      pieMetric: ["Count"],
      pieDimensions: ["Created At: Month"],
    });
    await saveDashcardVisualizerModal(page);
    await saveDashboard(page);

    await editDashboard(page);
    await showDashcardVisualizerModal(page, 1);

    const resetButton = await resetDataSourceButton(page, ORDERS_COUNT_BY_CREATED_AT.name);
    await expect(resetButton).toBeEnabled();
    await resetButton.click();

    await assertWellItems(page, {
      vertical: ["Count"],
      horizontal: ["Created At: Month"],
    });

    await expect(await resetDataSourceButton(page, ORDERS_COUNT_BY_CREATED_AT.name)).toBeDisabled();
  });

  test("should allow viewing the table preview (metabase#69038)", async ({ page, mb }) => {
    const dashboardId = await createDashboardWithVisualizerDashcards(mb.api, ids);
    await visitDashboard(page, mb.api, dashboardId);
    await editDashboard(page);

    await showDashcardVisualizerModal(page, 0);

    await page.getByTestId("visualizer-view-as-table-button").click();

    await expect(
      page.getByTestId("visualizer-tabular-preview-modal").getByText("Count", { exact: true }),
    ).toBeVisible();
  });
});

/**
 * The chart-settings "card.description" input. Cypress used .type(); real
 * keystrokes so onChange fires, then blur to commit.
 */
async function typeIntoDescription(
  page: import("@playwright/test").Page,
  value: string,
  { clear = false }: { clear?: boolean } = {},
) {
  const field = modal(page).getByTestId("card.description");
  await field.click();
  if (clear) {
    await field.press("ControlOrMeta+a");
    await field.press("Delete");
  }
  await field.pressSequentially(value);
  await field.blur();
}
