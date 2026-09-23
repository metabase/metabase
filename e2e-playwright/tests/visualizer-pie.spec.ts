/**
 * Playwright port of
 * e2e/test/scenarios/dashboard/visualizer/pie.cy.spec.ts
 *
 * Visualizer pie dashcard: open the visualizer settings modal on the pie
 * dashcard, toggle the "Show total" pie setting, and assert the center total
 * (value "200" + label "Total") appears/disappears in the chart preview.
 *
 * Port notes:
 * - beforeEach creates the same 10 questions the Cypress spec's wrapId/@alias
 *   mechanism did, into an `ids` map. The Products-by-Category *pie* question is
 *   created for fidelity (upstream does), but the dashboard builder draws its
 *   pie dashcard from productsCountByCategoryQuestionId, so it isn't in the map.
 * - createDashboardWithVisualizerDashcards (support/visualizer-basics.ts)
 *   returns the dashboard id and does NOT visit (unlike the Cypress helper),
 *   so the caller navigates with visitDashboard.
 * - The three beforeEach intercepts (@dataset / @cardQuery / @dashcardQuery)
 *   are never cy.wait()ed in this spec, so they're dropped (PORTING rule 2).
 * - The chart preview lives inside the visualizer modal; the dashboard behind
 *   (in edit mode) also renders chart-containers, so echartsContainer is scoped
 *   to the modal to avoid a strict-mode multi-match — hence the inline
 *   modal(page).getByTestId("chart-container") rather than the page-global
 *   charts.ts echartsContainer.
 * - No new helpers were needed; everything is imported read-only from the
 *   shared visualizer surface.
 */
import { editDashboard } from "../support/dashboard";
import { showDashcardVisualizerModalSettings } from "../support/dashboard-card-repros";
import { expect, test } from "../support/fixtures";
import { modal, visitDashboard } from "../support/ui";
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
} from "../support/visualizer-basics";

test.describe("scenarios > dashboard > visualizer > pie", () => {
  let ids: VisualizerQuestionIds;

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();

    const api = mb.api;
    ids = {
      ordersCountByCreatedAtQuestionId: await createQuestion(
        api,
        ORDERS_COUNT_BY_CREATED_AT,
      ),
      ordersCountByProductCategoryQuestionId: await createQuestion(
        api,
        ORDERS_COUNT_BY_PRODUCT_CATEGORY,
      ),
      productsCountByCreatedAtQuestionId: await createQuestion(
        api,
        PRODUCTS_COUNT_BY_CREATED_AT,
      ),
      productsCountByCategoryQuestionId: await createQuestion(
        api,
        PRODUCTS_COUNT_BY_CATEGORY,
      ),
      landingPageViewsScalarQuestionId: 0,
      checkoutPageViewsScalarQuestionId: 0,
      paymentDonePageViewsScalarQuestionId: 0,
      stepColumnQuestionId: 0,
      viewsColumnQuestionId: 0,
    };
    // Created for fidelity with upstream (not used by the dashboard builder,
    // which builds its pie dashcard from productsCountByCategoryQuestionId).
    await createQuestion(api, PRODUCTS_COUNT_BY_CATEGORY_PIE);
    ids.landingPageViewsScalarQuestionId = await createNativeQuestion(
      api,
      SCALAR_CARD.LANDING_PAGE_VIEWS,
    );
    ids.checkoutPageViewsScalarQuestionId = await createNativeQuestion(
      api,
      SCALAR_CARD.CHECKOUT_PAGE_VIEWS,
    );
    ids.paymentDonePageViewsScalarQuestionId = await createNativeQuestion(
      api,
      SCALAR_CARD.PAYMENT_DONE_PAGE_VIEWS,
    );
    ids.stepColumnQuestionId = await createNativeQuestion(
      api,
      STEP_COLUMN_CARD,
    );
    ids.viewsColumnQuestionId = await createNativeQuestion(
      api,
      VIEWS_COLUMN_CARD,
    );
  });

  test("should allow to change viz settings", async ({ page, mb }) => {
    const dashboardId = await createDashboardWithVisualizerDashcards(
      mb.api,
      ids,
    );
    await visitDashboard(page, mb.api, dashboardId);
    await editDashboard(page);

    // Pie chart (dashcard index 2)
    await showDashcardVisualizerModalSettings(page, 2);

    const dialog = modal(page);
    await dialog.getByText("Display", { exact: true }).click();

    // The chart preview inside the modal (scoped to avoid the dashboard's
    // other chart-containers behind the modal).
    const chart = dialog.getByTestId("chart-container");
    await expect(chart.getByText("200", { exact: true })).toBeVisible();
    await expect(chart.getByText("Total", { exact: true })).toBeVisible();

    await dialog
      .getByTestId("chartsettings-sidebar")
      .getByText("Show total", { exact: true })
      .click();

    await expect(chart.getByText("200", { exact: true })).toHaveCount(0);
    await expect(chart.getByText("Total", { exact: true })).toHaveCount(0);

    await dialog.getByRole("button", { name: "Save", exact: true }).click();
  });
});
