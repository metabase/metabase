/**
 * Playwright port of
 * e2e/test/scenarios/dashboard-filters-2/dashboard-filters-misc.cy.spec.ts
 *
 * The upstream file was reduced to a single "pivot tables" test: a pivot
 * dashcard must not expose an extra filtering stage among its parameter-mapping
 * options, and drilling into it from the dashcard header must not offer
 * "Summaries" in the filter picker. Shared query-stages fixtures come from
 * support/dashboard-filters-2.ts read-only; the pivot query + single-card
 * dashboard live in support/dashboard-filters-misc.ts.
 *
 * Porting notes:
 * - `cy.intercept("POST", "/api/dataset/pivot").as("datasetPivot")` +
 *   `cy.wait("@datasetPivot")` becomes a `page.waitForResponse` registered
 *   BEFORE the legend-caption click and awaited after (rule 2). The other
 *   Cypress intercepts (@dataset/@getDashboard/@cardQuery) were never awaited,
 *   so they are dropped.
 * - `H.getDashboardCard(i).findByTestId("loading-indicator").should("not.exist")`
 *   → `toHaveCount(0)`.
 * - `cy.button(/Filter/)` is a regex → `getByRole("button", { name: /Filter/ })`.
 * - `H.popover().findByText("Summaries").should("not.exist")` → exact-text
 *   (rule 1) `toHaveCount(0)`.
 * - TODO comments preserving https://github.com/metabase/metabase/issues/46845
 *   (duplicated Product mapping sections) are carried over verbatim.
 */
import {
  ORDERS_DATE_COLUMNS,
  ORDERS_NUMBER_COLUMNS,
  PEOPLE_DATE_COLUMNS,
  PEOPLE_NUMBER_COLUMNS,
  PEOPLE_TEXT_COLUMNS,
  PRODUCTS_DATE_COLUMNS,
  PRODUCTS_NUMBER_COLUMNS,
  PRODUCTS_TEXT_COLUMNS,
  REVIEWS_DATE_COLUMNS,
  REVIEWS_NUMBER_COLUMNS,
  REVIEWS_TEXT_COLUMNS,
  createBaseQuestions,
  getFilter,
  verifyDashcardMappingOptions,
} from "../support/dashboard-filters-2";
import {
  createAndVisitPivotDashboard,
  createPivotQuestion,
} from "../support/dashboard-filters-misc";
import { editDashboard, getDashboardCard, saveDashboard } from "../support/dashboard";
import { expect, test } from "../support/fixtures";
import { popover } from "../support/ui";

test.describe("pivot tables", () => {
  const QUESTION_PIVOT_INDEX = 0;

  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    const bases = await createBaseQuestions(mb.api);

    const pivotCard = await createPivotQuestion(mb.api, bases.baseQuestion);
    await createAndVisitPivotDashboard(page, mb, pivotCard);
  });

  test("does not use extra filtering stage for pivot tables", async ({
    page,
  }) => {
    // dashboard parameters mapping
    await editDashboard(page);

    // ## date columns
    await getFilter(page, "Date").click();
    await verifyDateMappingOptions();

    // ## text columns
    await getFilter(page, "Text").click();
    await verifyTextMappingOptions();

    // ## number columns
    await getFilter(page, "Number").click();
    await verifyNumberMappingOptions();

    // This test only inspects parameter mapping options without changing any
    // mappings, so saving issues no dashboard PUT. Use awaitRequest: false so we
    // deterministically exit to view mode (edit bar gone) without waiting on a
    // saveDashboardCards request that never fires — while still guaranteeing the
    // subsequent legend-caption drill lands in view mode, where it triggers the
    // pivot query.
    await saveDashboard(page, { awaitRequest: false });

    // filter picker

    // After exiting edit mode the pivot dashcard re-renders and re-runs its
    // query. Until that finishes the dashcard title isn't wired to open the
    // question — its click handler is only attached once the card series has
    // loaded — so clicking it too early navigates nowhere and the pivot query
    // never fires. Wait for the card to finish loading before clicking.
    await expect(
      getDashboardCard(page, QUESTION_PIVOT_INDEX).getByTestId(
        "legend-caption-title",
      ),
    ).toBeVisible();
    await expect(
      getDashboardCard(page, QUESTION_PIVOT_INDEX).getByTestId(
        "loading-indicator",
      ),
    ).toHaveCount(0);

    // Clicking the title navigates to an ad-hoc QB, which must boot the route,
    // load table metadata, and only then issue /api/dataset/pivot. Register the
    // wait before the click; that whole chain can take a while under load, so
    // rely on the action timeout rather than a short default.
    const datasetPivot = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/dataset/pivot",
    );
    await getDashboardCard(page, QUESTION_PIVOT_INDEX)
      .getByTestId("legend-caption-title")
      .click();
    await datasetPivot;

    await page
      .getByTestId("qb-header")
      .getByRole("button", { name: /Filter/ })
      .click();
    await expect(
      popover(page).getByText("Summaries", { exact: true }),
    ).toHaveCount(0);

    async function verifyDateMappingOptions() {
      await verifyDashcardMappingOptions(page, QUESTION_PIVOT_INDEX, [
        ["Base Orders Question", ORDERS_DATE_COLUMNS],
        ["Reviews", REVIEWS_DATE_COLUMNS],
        ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
        ["User", PEOPLE_DATE_COLUMNS],
      ]);
    }

    async function verifyTextMappingOptions() {
      await verifyDashcardMappingOptions(page, QUESTION_PIVOT_INDEX, [
        ["Reviews", REVIEWS_TEXT_COLUMNS],
        ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
        ["User", PEOPLE_TEXT_COLUMNS],
      ]);
    }

    async function verifyNumberMappingOptions() {
      await verifyDashcardMappingOptions(page, QUESTION_PIVOT_INDEX, [
        ["Base Orders Question", [...ORDERS_NUMBER_COLUMNS, "Net"]],
        ["Reviews", REVIEWS_NUMBER_COLUMNS],
        ["Product", [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
        ["User", PEOPLE_NUMBER_COLUMNS],
      ]);
    }
  });
});
