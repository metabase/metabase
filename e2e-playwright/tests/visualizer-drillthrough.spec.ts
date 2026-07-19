/**
 * Playwright port of
 * e2e/test/scenarios/dashboard/visualizer/drillthrough.cy.spec.ts
 *
 * Drill-through from visualizer dashcards: click a series/point → drill menu
 * (a click-actions popover) → underlying records / filtered question,
 * respecting the multi-source visualizer column mapping.
 *
 * Port notes:
 * - beforeEach creates 10 questions and keeps their ids in `ids` (the Cypress
 *   wrapId/@alias mechanism). createDashboardWithVisualizerDashcards takes that
 *   object instead of reading Cypress aliases. The Products-by-Category *pie*
 *   question is created for fidelity but isn't part of the id map (the dashboard
 *   builds its pie dashcard from productsCountByCategoryQuestionId, like upstream).
 * - The three beforeEach intercepts map to registered waits (PORTING rule 2):
 *   @dataset → waitForDataset, @cardQuery → waitForCardQueries. @dashcardQuery
 *   is registered upstream but never cy.wait()ed, so it's dropped.
 * - Every `H.getDashboardCard(n).within(...)` chart interaction becomes a
 *   card-scoped locator; the dashboard renders six chart-containers, so the
 *   page-global chart helpers would violate strict mode. cartesianChartCircleWithColor
 *   and applyBrush are the scoped ports (support/visualizer-drillthrough.ts);
 *   chartPathWithFillColor / echartsTextExact (scoped) and chartLegendItem are
 *   imported read-only.
 * - Pie drill: force-click the wedge <path> (wave-13 gotcha — the wedge's own
 *   leader label overlays it and zrender hit-tests by coordinate).
 * - ECharts axis <text> carries surrounding whitespace and Playwright's
 *   getByText does NOT trim (testing-library findByText does), so chart-label
 *   assertions use echartsTextExact (whitespace-tolerant regex).
 * - VIZ-979's `cy.get("@dataset.all").should("have.length", 0)` (a brush on a
 *   multi-series chart fires no query) is ported with trackDatasetRequests.
 */
import { getDashboardCard } from "../support/dashboard";
import { expect, test } from "../support/fixtures";
import { assertQueryBuilderRowCount, queryBuilderMain } from "../support/notebook";
import { queryBuilderFiltersPanel } from "../support/detail-view";
import { tableInteractiveHeader } from "../support/table-column-settings";
import { clickActionsPopover } from "../support/relative-datetime";
import { echartsContainer, tooltip } from "../support/charts";
import { chartLegendItem } from "../support/metrics-dashboard";
import { queryBuilderHeader, visitDashboard } from "../support/ui";
import {
  ORDERS_COUNT_BY_CREATED_AT,
  ORDERS_COUNT_BY_PRODUCT_CATEGORY,
  PRODUCTS_COUNT_BY_CATEGORY,
  PRODUCTS_COUNT_BY_CATEGORY_PIE,
  PRODUCTS_COUNT_BY_CREATED_AT,
  SCALAR_CARD,
  STEP_COLUMN_CARD,
  VIEWS_COLUMN_CARD,
  type VisualizerQuestionIds,
  createDashboardWithVisualizerDashcards,
  createNativeQuestion,
  createQuestion,
  waitForCardQueries,
} from "../support/visualizer-basics";
import {
  chartPathWithFillColor,
  echartsTextExact,
} from "../support/visualizer-cartesian";
import {
  applyBrush,
  cartesianChartCircleWithColor,
  trackDatasetRequests,
  waitForDataset,
} from "../support/visualizer-drillthrough";

test.describe("scenarios > dashboard > visualizer > drillthrough", () => {
  let ids: VisualizerQuestionIds;

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();

    const api = mb.api;
    ids = {
      ordersCountByCreatedAtQuestionId: await createQuestion(api, ORDERS_COUNT_BY_CREATED_AT),
      ordersCountByProductCategoryQuestionId: await createQuestion(api, ORDERS_COUNT_BY_PRODUCT_CATEGORY),
      productsCountByCreatedAtQuestionId: await createQuestion(api, PRODUCTS_COUNT_BY_CREATED_AT),
      productsCountByCategoryQuestionId: await createQuestion(api, PRODUCTS_COUNT_BY_CATEGORY),
      // scalars + step/views come after the pie question upstream, but order
      // doesn't matter — only the id map does.
      landingPageViewsScalarQuestionId: 0,
      checkoutPageViewsScalarQuestionId: 0,
      paymentDonePageViewsScalarQuestionId: 0,
      stepColumnQuestionId: 0,
      viewsColumnQuestionId: 0,
    };
    // Created for fidelity with upstream (not used by the dashboard builder,
    // which builds its pie dashcard from productsCountByCategoryQuestionId).
    await createQuestion(api, PRODUCTS_COUNT_BY_CATEGORY_PIE);
    ids.landingPageViewsScalarQuestionId = await createNativeQuestion(api, SCALAR_CARD.LANDING_PAGE_VIEWS);
    ids.checkoutPageViewsScalarQuestionId = await createNativeQuestion(api, SCALAR_CARD.CHECKOUT_PAGE_VIEWS);
    ids.paymentDonePageViewsScalarQuestionId = await createNativeQuestion(api, SCALAR_CARD.PAYMENT_DONE_PAGE_VIEWS);
    ids.stepColumnQuestionId = await createNativeQuestion(api, STEP_COLUMN_CARD);
    ids.viewsColumnQuestionId = await createNativeQuestion(api, VIEWS_COLUMN_CARD);
  });

  test("should work", async ({ page, mb }) => {
    const dashboardId = await createDashboardWithVisualizerDashcards(mb.api, ids);
    await visitDashboard(page, mb.api, dashboardId);

    const ORDERS_SERIES_COLOR = "#509EE3";
    const PRODUCTS_SERIES_COLOR = "#88BF4D";

    // 1. Cartesian chart, timeseries breakout
    const SEP_2025_POINT_INDEX = 5;

    await cartesianChartCircleWithColor(getDashboardCard(page, 0), PRODUCTS_SERIES_COLOR)
      .nth(SEP_2025_POINT_INDEX)
      .click();

    let dataset = waitForDataset(page);
    await clickActionsPopover(page).getByText("See these Products", { exact: true }).click();
    await dataset;

    await expect(queryBuilderFiltersPanel(page).locator("> *")).toHaveCount(1);
    await expect(
      queryBuilderFiltersPanel(page).getByText("Created At: Month is Sep 1–30, 2025", { exact: true }),
    ).toBeVisible();
    await assertQueryBuilderRowCount(page, 9);
    // ensure we're on the Products table
    await expect(tableInteractiveHeader(page).getByText("Price", { exact: true })).toBeVisible();

    await queryBuilderHeader(page).getByLabel("Back to Test Dashboard", { exact: true }).click();

    await cartesianChartCircleWithColor(getDashboardCard(page, 0), ORDERS_SERIES_COLOR)
      .nth(SEP_2025_POINT_INDEX)
      .click();

    await clickActionsPopover(page).getByText("Break out by…", { exact: true }).click();
    await clickActionsPopover(page).getByText("Category", { exact: true }).click();
    dataset = waitForDataset(page);
    await clickActionsPopover(page).getByText("Source", { exact: true }).click();
    await dataset;

    await expect(queryBuilderFiltersPanel(page).locator("> *")).toHaveCount(1);
    await expect(
      queryBuilderFiltersPanel(page).getByText("Created At: Month is Sep 1–30, 2025", { exact: true }),
    ).toBeVisible();
    await assertQueryBuilderRowCount(page, 5);
    await expect(echartsTextExact(page, "Affiliate")).toBeVisible();
    await expect(echartsTextExact(page, "Organic")).toBeVisible();
    await expect(echartsTextExact(page, "Twitter")).toBeVisible();

    await queryBuilderHeader(page).getByLabel("Back to Test Dashboard", { exact: true }).click();

    let cardQuery = waitForCardQueries(page, 1);
    await chartLegendItem(getDashboardCard(page, 0), ORDERS_COUNT_BY_CREATED_AT.name).click();
    await cardQuery;
    await expect(
      queryBuilderHeader(page).getByText(ORDERS_COUNT_BY_CREATED_AT.name, { exact: true }),
    ).toBeVisible();
    await assertQueryBuilderRowCount(page, 49);

    await queryBuilderHeader(page).getByLabel("Back to Test Dashboard", { exact: true }).click();

    cardQuery = waitForCardQueries(page, 1);
    await chartLegendItem(getDashboardCard(page, 0), PRODUCTS_COUNT_BY_CREATED_AT.name).click();
    await cardQuery;
    await expect(
      queryBuilderHeader(page).getByText(PRODUCTS_COUNT_BY_CREATED_AT.name, { exact: true }),
    ).toBeVisible();
    await assertQueryBuilderRowCount(page, 37);

    await queryBuilderHeader(page).getByLabel("Back to Test Dashboard", { exact: true }).click();

    // 2. Cartesian chart, category breakout
    await chartPathWithFillColor(getDashboardCard(page, 1), ORDERS_SERIES_COLOR).nth(1).click();
    dataset = waitForDataset(page);
    await clickActionsPopover(page).getByText("See these Orders", { exact: true }).click();
    await dataset;

    await expect(queryBuilderFiltersPanel(page).locator("> *")).toHaveCount(1);
    await expect(
      queryBuilderFiltersPanel(page).getByText("Product → Category is Gadget", { exact: true }),
    ).toBeVisible();
    // ensure we're on the Orders table
    await expect(tableInteractiveHeader(page).getByText("Subtotal", { exact: true })).toBeVisible();

    await queryBuilderHeader(page).getByLabel("Back to Test Dashboard", { exact: true }).click();

    await chartPathWithFillColor(getDashboardCard(page, 1), "#EF8C8C").nth(0).click();
    dataset = waitForDataset(page);
    await clickActionsPopover(page).getByRole("button", { name: ">", exact: true }).click();
    await dataset;

    await expect(queryBuilderFiltersPanel(page).locator("> *")).toHaveCount(1);
    await expect(
      queryBuilderFiltersPanel(page).getByText("Count is greater than 42", { exact: true }),
    ).toBeVisible();
    await assertQueryBuilderRowCount(page, 3);

    await queryBuilderHeader(page).getByLabel("Back to Test Dashboard", { exact: true }).click();

    // 3. Pie chart — force-click the wedge path (its leader label overlays it)
    await chartPathWithFillColor(getDashboardCard(page, 2), "#F2A86F").click({ force: true });
    dataset = waitForDataset(page);
    await clickActionsPopover(page).getByText("See these Products", { exact: true }).click();
    await dataset;

    await expect(queryBuilderFiltersPanel(page).locator("> *")).toHaveCount(1);
    await expect(
      queryBuilderFiltersPanel(page).getByText("Category is Widget", { exact: true }),
    ).toBeVisible();
    await expect(tableInteractiveHeader(page).getByText("Price", { exact: true })).toBeVisible();
    await assertQueryBuilderRowCount(page, 54);

    await queryBuilderHeader(page).getByLabel("Back to Test Dashboard", { exact: true }).click();

    // 4. Funnel (regular).
    // NOTE the upstream selector `H.getDashboardCard(4).get("polygon").first()`:
    // chaining Cypress's `.get()` off a subject IGNORES that subject and queries
    // the whole document, so `.first()` is the first polygon ON THE PAGE — which
    // is this (regular) funnel's, since it precedes the scalar funnel in the DOM.
    // The scalar-funnel step below is the same expression and therefore clicks
    // the SAME polygon; the port keeps both page-global to stay faithful.
    await page.locator("polygon").first().click();
    await expect(tooltip(page)).toHaveCount(0);
    dataset = waitForDataset(page);
    await clickActionsPopover(page).getByRole("button", { name: "=", exact: true }).click();
    await dataset;

    await expect(queryBuilderFiltersPanel(page).locator("> *")).toHaveCount(1);
    await expect(
      queryBuilderFiltersPanel(page).getByText("Views is equal to 600", { exact: true }),
    ).toBeVisible();
    await expect(tableInteractiveHeader(page).getByText("Views", { exact: true })).toBeVisible();
    await assertQueryBuilderRowCount(page, 1);

    await queryBuilderHeader(page).getByLabel("Back to Test Dashboard", { exact: true }).click();

    // 5. Funnel (scalar). Upstream's `H.getDashboardCard(5).get("polygon").first()`
    // is — because of the `.get()` scope-break above — the SAME page-first polygon
    // as step 4 (the regular funnel), so this drills the regular funnel's "Views"
    // column again, hence the identical "Views is equal to 600" assertion.
    // (Card-scoping this to the actual scalar funnel drills its raw "views" column
    // and reads lowercase "views is equal to 600" — verified via the Cypress
    // cross-check on this jar, which renders "Views" and passes.)
    await page.locator("polygon").first().click();
    await expect(tooltip(page)).toHaveCount(0);
    dataset = waitForDataset(page);
    await clickActionsPopover(page).getByRole("button", { name: "=", exact: true }).click();
    await dataset;

    await expect(queryBuilderFiltersPanel(page).locator("> *")).toHaveCount(1);
    await expect(
      queryBuilderFiltersPanel(page).getByText("Views is equal to 600", { exact: true }),
    ).toBeVisible();
    await expect(tableInteractiveHeader(page).getByText("Views", { exact: true })).toBeVisible();
    await assertQueryBuilderRowCount(page, 1);
  });

  test("should allow brush filtering single-series timeseries charts (VIZ-979)", async ({
    page,
    mb,
  }) => {
    const dashboardId = await createDashboardWithVisualizerDashcards(mb.api, ids);
    await visitDashboard(page, mb.api, dashboardId);

    const tracker = trackDatasetRequests(page);

    // Ensure the brush is disabled for multi-series charts
    const card0 = getDashboardCard(page, 0);
    await expect(card0.getByText(ORDERS_COUNT_BY_CREATED_AT.name, { exact: true })).toHaveCount(2);
    await expect(card0.getByText(PRODUCTS_COUNT_BY_CREATED_AT.name, { exact: true })).toHaveCount(2);
    await applyBrush(card0, 200, 300);
    // no /api/dataset request should fire for a multi-series brush
    await page.waitForTimeout(500);
    expect(tracker.count()).toBe(0);
    tracker.dispose();

    const card3 = getDashboardCard(page, 3);
    await expect(card3.getByText(PRODUCTS_COUNT_BY_CREATED_AT.name, { exact: true })).toBeVisible();
    const dataset = waitForDataset(page);
    await applyBrush(card3, 200, 300);
    await dataset;

    await expect(
      queryBuilderFiltersPanel(page).getByText(/Created At: Month is May 1/),
    ).toBeVisible();
    await assertQueryBuilderRowCount(page, 9);
    await expect(echartsTextExact(queryBuilderMain(page), "Count")).toBeVisible(); // y-axis
    await expect(echartsTextExact(queryBuilderMain(page), "Created At: Month")).toBeVisible(); // x-axis
    await expect(echartsTextExact(queryBuilderMain(page), "May 2026")).toBeVisible();
    await expect(echartsTextExact(queryBuilderMain(page), "December 2026")).toBeVisible();
  });
});
