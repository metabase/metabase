/**
 * Playwright port of
 * e2e/test/scenarios/dashboard/visualizer/filters.cy.spec.ts
 *
 * Port notes:
 * - The file's ONLY test carries `{ tags: "@skip" }` upstream (with a TODO
 *   saying the two datasets should be compatible), so it never runs in CI.
 *   Ported faithfully as `test.skip(...)` with the body transcribed — it is
 *   NOT made to pass. Consequence: this spec has zero executed assertions.
 * - Dropped never-awaited intercepts: @dataset, @cardQuery, @dashcardQuery are
 *   registered in the upstream beforeEach and never `cy.wait()`ed (PORTING
 *   rule 2). The shared `selectDataset` helper already waits on its own card
 *   query.
 * - Upstream's `wrapId`/`idAlias` mechanism is replaced by plain locals; the
 *   ids are in fact never read by the test body.
 * - PRODUCTS_AVERAGE_BY_CATEGORY is not in support/visualizer-basics.ts (which
 *   carries PRODUCTS_AVERAGE_BY_CREATED_AT), so it is transcribed here from
 *   e2e/support/test-visualizer-data.ts rather than editing a shared module.
 */
import { expect, test } from "../support/fixtures";
import {
  editDashboard,
  filterWidget,
  getDashboardCard,
  saveDashboard,
  selectDashboardFilter,
  setFilter,
} from "../support/dashboard";
import { modal, popover, visitDashboard } from "../support/ui";
import { SAMPLE_DATABASE } from "../support/sample-data";
import {
  PRODUCTS_COUNT_BY_CATEGORY,
  type StructuredQuestionDetails,
  assertWellItemsCount,
  clickVisualizeAnotherWay,
  createDashboard,
  createQuestion,
  openQuestionsSidebar,
  saveDashcardVisualizerModal,
  selectDataset,
  switchToAddMoreData,
} from "../support/visualizer-basics";

const { PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE as {
  PRODUCTS: Record<string, number>;
  PRODUCTS_ID: number;
};

/** Port of PRODUCTS_AVERAGE_BY_CATEGORY (e2e/support/test-visualizer-data.ts). */
const PRODUCTS_AVERAGE_BY_CATEGORY: StructuredQuestionDetails = {
  display: "bar",
  name: "Products average by Category",
  query: {
    "source-table": PRODUCTS_ID,
    aggregation: [["avg", ["field", PRODUCTS.PRICE, null]]],
    breakout: [["field", PRODUCTS.CATEGORY, null]],
  },
  visualization_settings: {
    "graph.dimensions": ["CATEGORY"],
    "graph.metrics": ["avg"],
  },
};

test.describe("scenarios > dashboard > visualizer > filters", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsNormalUser();

    await createQuestion(mb.api, PRODUCTS_COUNT_BY_CATEGORY);
    await createQuestion(mb.api, PRODUCTS_AVERAGE_BY_CATEGORY);
  });

  // TODO those two datasets should be compatible with each other
  // Upstream carries `{ tags: "@skip" }` — kept skipped, faithfully.
  test.skip("should create and update a dashcard with 'Visualize another way' button", async ({
    page,
    mb,
  }) => {
    const dashboardId = await createDashboard(mb.api, {});
    await visitDashboard(page, mb.api, dashboardId);

    await editDashboard(page);
    await openQuestionsSidebar(page);
    await clickVisualizeAnotherWay(page, PRODUCTS_COUNT_BY_CATEGORY.name);

    await switchToAddMoreData(page);
    await selectDataset(page, PRODUCTS_AVERAGE_BY_CATEGORY.name);
    await assertWellItemsCount(page, { vertical: 2 });
    await expect(modal(page)).toBeVisible();

    await saveDashcardVisualizerModal(page, { mode: "create" });

    await setFilter(page, "Text or Category", "Is");

    // Doing it twice to populate the two filters
    await selectDashboardFilter(getDashboardCard(page, 0), "Category");
    await selectDashboardFilter(getDashboardCard(page, 0), "Category");

    await saveDashboard(page);

    await expect(
      getDashboardCard(page, 0).getByText("Doohickey", { exact: true }),
    ).toBeAttached();

    await filterWidget(page)
      .filter({ hasText: /Text/ })
      .first()
      .click();
    await popover(page).getByText("Gadget", { exact: true }).click();
    await popover(page).getByRole("button", { name: "Add filter" }).click();

    await expect(
      getDashboardCard(page, 0).getByText("Doohickey", { exact: true }),
    ).toHaveCount(0);
  });
});
