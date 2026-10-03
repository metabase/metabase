/**
 * Playwright port of
 * e2e/test/scenarios/dashboard-filters-2/dashboard-filters-2-stage-4.cy.spec.ts
 *
 * Dashboard filters mapped onto two-stage queries (Q8: 1st stage join + custom
 * column + 2 aggregations + 2 breakouts, then a 2nd stage repeating the same).
 * The four dashcards form the card matrix (question/model × question/model
 * based). Shared helpers live in support/dashboard-filters-2.ts.
 *
 * Porting notes:
 * - The Cypress `cy.intercept(...).as()` aliases become waitForResponse helpers
 *   registered before the triggering action: `waitForDashboardData(page, n)` and
 *   its public/embedded siblings (rule 2). The setup functions that ended with
 *   `cy.wait(["@dashboardData", "@dashboardData"])` fold that wait inside
 *   themselves; where the test called `apply*()` then waited, the wait is
 *   registered around the `apply*()` call here.
 * - `getDashboardId()` (a Cypress alias) is replaced by the dashboard id the
 *   matrix helper returns.
 * - TODO comments preserving https://github.com/metabase/metabase/issues/46845
 *   (duplicated Reviews/Product mapping sections) are carried over verbatim.
 */
import {
  MODEL_BASED_MODEL_INDEX,
  MODEL_BASED_QUESTION_INDEX,
  ORDERS_DATE_COLUMNS,
  ORDERS_NUMBER_COLUMNS,
  PEOPLE_DATE_COLUMNS,
  PEOPLE_NUMBER_COLUMNS,
  PEOPLE_TEXT_COLUMNS,
  PRODUCTS_DATE_COLUMNS,
  PRODUCTS_NUMBER_COLUMNS,
  PRODUCTS_TEXT_COLUMNS,
  QUESTION_BASED_MODEL_INDEX,
  QUESTION_BASED_QUESTION_INDEX,
  REVIEWS_DATE_COLUMNS,
  REVIEWS_NUMBER_COLUMNS,
  REVIEWS_TEXT_COLUMNS,
  apply1stStageExplicitJoinFilter,
  apply2ndStageAggregationFilter,
  apply2ndStageBreakoutFilter,
  apply2ndStageCustomColumnFilter,
  assertDashcardRowsCount,
  createAndVisitDashboardWithCardMatrix,
  createBaseQuestions,
  createQ8Query,
  getFilter,
  goBackToDashboard,
  setup1stStageAggregationFilter,
  setup1stStageBreakoutFilter,
  setup1stStageCustomColumnFilter,
  setup1stStageExplicitJoinFilter,
  setup1stStageImplicitJoinFromJoinFilter,
  setup1stStageImplicitJoinFromSourceFilter,
  setup2ndStageAggregationFilter,
  setup2ndStageBreakoutFilter,
  setup2ndStageCustomColumnFilter,
  setup2ndStageExplicitJoinFilter,
  verifyDashcardMappingOptions,
  verifyDashcardRowsCount,
  verifyNoDashcardMappingOptions,
  waitForDashboardData,
  waitForEmbeddedDashboardData,
  waitForPublicDashboardData,
  type BaseQuestions,
} from "../support/dashboard-filters-2";
import { editDashboard } from "../support/dashboard";
import { test } from "../support/fixtures";
import { visitEmbeddedPage, visitPublicDashboard } from "../support/question-saved";

/**
 * Abbreviations used for card aliases in this test suite:
 *  qbq = question-based question
 *  qbm = question-based model
 *  mbq = model-based question
 *  mbm = model-based model
 */
test.describe("scenarios > dashboard > filters > query stages", () => {
  let bases: BaseQuestions;

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    bases = await createBaseQuestions(mb.api);
  });

  test.describe("2-stage queries", () => {
    test.describe(
      "Q8 - Q4 + 2nd stage with join, custom column, 2 aggregations, 2 breakouts",
      () => {
        let dashboardId: number;

        test.beforeEach(async ({ page, mb }) => {
          dashboardId = await createAndVisitDashboardWithCardMatrix(
            page,
            mb,
            createQ8Query,
            bases,
          );
        });

        test("allows to map to all relevant columns", async ({ page }) => {
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

          async function verifyDateMappingOptions() {
            await verifyDashcardMappingOptions(
              page,
              QUESTION_BASED_QUESTION_INDEX,
              [
                ["Base Orders Question", ORDERS_DATE_COLUMNS],
                [
                  "Reviews",
                  [...REVIEWS_DATE_COLUMNS, ...REVIEWS_DATE_COLUMNS],
                ], // TODO: https://github.com/metabase/metabase/issues/46845
                [
                  "Product",
                  [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS],
                ], // TODO: https://github.com/metabase/metabase/issues/46845
                ["User", PEOPLE_DATE_COLUMNS],
                ["Summaries", ["Created At: Month", "User → Created At: Year"]],
              ],
            );
            await verifyDashcardMappingOptions(page, MODEL_BASED_QUESTION_INDEX, [
              ["Base Orders Model", ORDERS_DATE_COLUMNS],
              ["Reviews", [...REVIEWS_DATE_COLUMNS, ...REVIEWS_DATE_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
              ["Product", [...PRODUCTS_DATE_COLUMNS, ...PRODUCTS_DATE_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
              ["User", PEOPLE_DATE_COLUMNS],
              ["Summaries", ["Created At: Month", "User → Created At: Year"]],
            ]);
            await verifyNoDashcardMappingOptions(
              page,
              QUESTION_BASED_MODEL_INDEX,
            );
            await verifyNoDashcardMappingOptions(page, MODEL_BASED_MODEL_INDEX);
          }

          async function verifyTextMappingOptions() {
            await verifyDashcardMappingOptions(
              page,
              QUESTION_BASED_QUESTION_INDEX,
              [
                ["Reviews", [...REVIEWS_TEXT_COLUMNS, ...REVIEWS_TEXT_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
                [
                  "Product",
                  [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS],
                ], // TODO: https://github.com/metabase/metabase/issues/46845
                ["User", PEOPLE_TEXT_COLUMNS],
                ["Summaries", ["Product → Category"]],
                [
                  "Summaries (2)",
                  [
                    "Reviews - Created At: Month → Reviewer",
                    "Product → Category",
                  ],
                ],
              ],
            );
            await verifyDashcardMappingOptions(page, MODEL_BASED_QUESTION_INDEX, [
              ["Reviews", [...REVIEWS_TEXT_COLUMNS, ...REVIEWS_TEXT_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
              ["Product", [...PRODUCTS_TEXT_COLUMNS, ...PRODUCTS_TEXT_COLUMNS]], // TODO: https://github.com/metabase/metabase/issues/46845
              ["User", PEOPLE_TEXT_COLUMNS],
              ["Summaries", ["Product → Category"]],
              [
                "Summaries (2)",
                ["Reviews - Created At: Month → Reviewer", "Product → Category"],
              ],
            ]);
            await verifyDashcardMappingOptions(page, QUESTION_BASED_MODEL_INDEX, [
              [
                null,
                ["Reviews - Created At: Month → Reviewer", "Product → Category"],
              ],
            ]);
            await verifyDashcardMappingOptions(page, MODEL_BASED_MODEL_INDEX, [
              [
                null,
                ["Reviews - Created At: Month → Reviewer", "Product → Category"],
              ],
            ]);
          }

          async function verifyNumberMappingOptions() {
            await verifyDashcardMappingOptions(
              page,
              QUESTION_BASED_QUESTION_INDEX,
              [
                ["Base Orders Question", [...ORDERS_NUMBER_COLUMNS, "Net"]],
                [
                  "Reviews",
                  [...REVIEWS_NUMBER_COLUMNS, ...REVIEWS_NUMBER_COLUMNS],
                ], // TODO: https://github.com/metabase/metabase/issues/46845
                [
                  "Product",
                  [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS],
                ], // TODO: https://github.com/metabase/metabase/issues/46845
                ["User", PEOPLE_NUMBER_COLUMNS],
                ["Summaries", ["Count", "Sum of Total", "5 * Count"]],
                [
                  "Summaries (2)",
                  ["Count", "Sum of Reviews - Created At: Month → Rating"],
                ],
              ],
            );
            await verifyDashcardMappingOptions(page, MODEL_BASED_QUESTION_INDEX, [
              ["Base Orders Model", [...ORDERS_NUMBER_COLUMNS, "Net"]],
              [
                "Reviews",
                [...REVIEWS_NUMBER_COLUMNS, ...REVIEWS_NUMBER_COLUMNS],
              ], // TODO: https://github.com/metabase/metabase/issues/46845
              [
                "Product",
                [...PRODUCTS_NUMBER_COLUMNS, ...PRODUCTS_NUMBER_COLUMNS],
              ], // TODO: https://github.com/metabase/metabase/issues/46845
              ["User", PEOPLE_NUMBER_COLUMNS],
              ["Summaries", ["Count", "Sum of Total", "5 * Count"]],
              [
                "Summaries (2)",
                ["Count", "Sum of Reviews - Created At: Month → Rating"],
              ],
            ]);
            await verifyDashcardMappingOptions(page, QUESTION_BASED_MODEL_INDEX, [
              [null, ["Count", "Sum of Reviews - Created At: Month → Rating"]],
            ]);
            await verifyDashcardMappingOptions(page, MODEL_BASED_MODEL_INDEX, [
              [null, ["Count", "Sum of Reviews - Created At: Month → Rating"]],
            ]);
          }
        });

        test.describe(
          "applies filter to the the dashcard and allows to drill via dashcard header",
          () => {
            test("1st stage explicit join", async ({ page, mb }) => {
              await setup1stStageExplicitJoinFilter(page);
              const wait = waitForDashboardData(page, 2);
              await apply1stStageExplicitJoinFilter(page);
              await wait;

              await verifyDashcardRowsCount(page, {
                dashcardIndex: 0,
                dashboardCount: 953,
                queryBuilderCount: "Showing 953 rows",
              });

              await goBackToDashboard(page);

              await verifyDashcardRowsCount(page, {
                dashcardIndex: 1,
                dashboardCount: 953,
                queryBuilderCount: "Showing 953 rows",
              });

              // public dashboard
              const pubWait = waitForPublicDashboardData(page, 4);
              await visitPublicDashboard(page, mb, dashboardId);
              await pubWait;
              await apply1stStageExplicitJoinFilter(page);

              await assertDashcardRowsCount(page, 0, 953);
              await assertDashcardRowsCount(page, 1, 953);

              // embedded dashboard
              const embWait = waitForEmbeddedDashboardData(page, 4);
              await visitEmbeddedPage(page, mb, {
                resource: { dashboard: dashboardId },
                params: {},
              });
              await embWait;
              const embWait2 = waitForEmbeddedDashboardData(page, 2);
              await apply1stStageExplicitJoinFilter(page);
              await embWait2;

              await assertDashcardRowsCount(page, 0, 953);
              await assertDashcardRowsCount(page, 1, 953);
            });

            test("1st stage implicit join (data source)", async ({ page }) => {
              await setup1stStageImplicitJoinFromSourceFilter(page);

              await verifyDashcardRowsCount(page, {
                dashcardIndex: 0,
                dashboardCount: 1044,
                queryBuilderCount: "Showing 1,044 rows",
              });

              await goBackToDashboard(page);

              await verifyDashcardRowsCount(page, {
                dashcardIndex: 1,
                dashboardCount: 1044,
                queryBuilderCount: "Showing 1,044 rows",
              });
            });

            test("1st stage implicit join (joined data source)", async ({
              page,
            }) => {
              await setup1stStageImplicitJoinFromJoinFilter(page);

              await verifyDashcardRowsCount(page, {
                dashcardIndex: 0,
                dashboardCount: 1077,
                queryBuilderCount: "Showing 1,077 rows",
              });

              await goBackToDashboard(page);

              await verifyDashcardRowsCount(page, {
                dashcardIndex: 1,
                dashboardCount: 1077,
                queryBuilderCount: "Showing 1,077 rows",
              });
            });

            test("1st stage custom column", async ({ page }) => {
              await setup1stStageCustomColumnFilter(page);

              await verifyDashcardRowsCount(page, {
                dashcardIndex: 0,
                dashboardCount: 688,
                queryBuilderCount: "Showing 688 rows",
              });

              await goBackToDashboard(page);

              await verifyDashcardRowsCount(page, {
                dashcardIndex: 1,
                dashboardCount: 688,
                queryBuilderCount: "Showing 688 rows",
              });
            });

            test("1st stage aggregation", async ({ page }) => {
              await setup1stStageAggregationFilter(page);

              await verifyDashcardRowsCount(page, {
                dashcardIndex: 1,
                dashboardCount: 3,
                queryBuilderCount: "Showing 3 rows",
              });

              await goBackToDashboard(page);

              await verifyDashcardRowsCount(page, {
                dashcardIndex: 1,
                dashboardCount: 3,
                queryBuilderCount: "Showing 3 rows",
              });
            });

            test("1st stage breakout", async ({ page }) => {
              await setup1stStageBreakoutFilter(page);

              await verifyDashcardRowsCount(page, {
                dashcardIndex: 0,
                dashboardCount: 1077,
                queryBuilderCount: "Showing 1,077 rows",
              });

              await goBackToDashboard(page);

              await verifyDashcardRowsCount(page, {
                dashcardIndex: 1,
                dashboardCount: 1077,
                queryBuilderCount: "Showing 1,077 rows",
              });
            });

            test("2nd stage explicit join", async ({ page }) => {
              await setup2ndStageExplicitJoinFilter(page);

              await verifyDashcardRowsCount(page, {
                dashcardIndex: 0,
                dashboardCount: 4,
                queryBuilderCount: "Showing 4 rows",
              });

              await goBackToDashboard(page);

              await verifyDashcardRowsCount(page, {
                dashcardIndex: 1,
                dashboardCount: 4,
                queryBuilderCount: "Showing 4 rows",
              });
            });

            test("2nd stage custom column", async ({ page, mb }) => {
              await setup2ndStageCustomColumnFilter(page);
              const wait = waitForDashboardData(page, 2);
              await apply2ndStageCustomColumnFilter(page);
              await wait;

              await verifyDashcardRowsCount(page, {
                dashcardIndex: 0,
                dashboardCount: 31,
                queryBuilderCount: "Showing 31 rows",
              });

              await goBackToDashboard(page);

              await verifyDashcardRowsCount(page, {
                dashcardIndex: 1,
                dashboardCount: 31,
                queryBuilderCount: "Showing 31 rows",
              });

              // public dashboard
              const pubWait = waitForPublicDashboardData(page, 4);
              await visitPublicDashboard(page, mb, dashboardId);
              await pubWait;
              const pubWait2 = waitForPublicDashboardData(page, 2);
              await apply2ndStageCustomColumnFilter(page);
              await pubWait2;

              await assertDashcardRowsCount(page, 0, 31);
              await assertDashcardRowsCount(page, 1, 31);

              // embedded dashboard
              const embWait = waitForEmbeddedDashboardData(page, 4);
              await visitEmbeddedPage(page, mb, {
                resource: { dashboard: dashboardId },
                params: {},
              });
              await embWait;
              const embWait2 = waitForEmbeddedDashboardData(page, 2);
              await apply2ndStageCustomColumnFilter(page);
              await embWait2;

              await assertDashcardRowsCount(page, 0, 31);
              await assertDashcardRowsCount(page, 1, 31);
            });

            test("2nd stage aggregation", async ({ page, mb }) => {
              await setup2ndStageAggregationFilter(page);
              const wait = waitForDashboardData(page, 2);
              await apply2ndStageAggregationFilter(page);
              await wait;

              await verifyDashcardRowsCount(page, {
                dashcardIndex: 0,
                dashboardCount: 6,
                queryBuilderCount: "Showing 6 rows",
              });

              await goBackToDashboard(page);

              await verifyDashcardRowsCount(page, {
                dashcardIndex: 1,
                dashboardCount: 6,
                queryBuilderCount: "Showing 6 rows",
              });

              await goBackToDashboard(page);

              await verifyDashcardRowsCount(page, {
                dashcardIndex: 2,
                dashboardCount: 6,
                queryBuilderCount: "Showing 6 rows",
              });

              await goBackToDashboard(page);

              await verifyDashcardRowsCount(page, {
                dashcardIndex: 3,
                dashboardCount: 6,
                queryBuilderCount: "Showing 6 rows",
              });

              // public dashboard
              const pubWait = waitForPublicDashboardData(page, 4);
              await visitPublicDashboard(page, mb, dashboardId);
              await pubWait;
              const pubWait2 = waitForPublicDashboardData(page, 2);
              await apply2ndStageAggregationFilter(page);
              await pubWait2;

              await assertDashcardRowsCount(page, 0, 6);
              await assertDashcardRowsCount(page, 1, 6);
              await assertDashcardRowsCount(page, 2, 6);
              await assertDashcardRowsCount(page, 3, 6);

              // embedded dashboard
              const embWait = waitForEmbeddedDashboardData(page, 4);
              await visitEmbeddedPage(page, mb, {
                resource: { dashboard: dashboardId },
                params: {},
              });
              await embWait;
              const embWait2 = waitForEmbeddedDashboardData(page, 2);
              await apply2ndStageAggregationFilter(page);
              await embWait2;

              await assertDashcardRowsCount(page, 0, 6);
              await assertDashcardRowsCount(page, 1, 6);
              await assertDashcardRowsCount(page, 2, 6);
              await assertDashcardRowsCount(page, 3, 6);
            });

            test("2nd stage breakout", async ({ page, mb }) => {
              await setup2ndStageBreakoutFilter(page);
              const wait = waitForDashboardData(page, 2);
              await apply2ndStageBreakoutFilter(page);
              await wait;

              await verifyDashcardRowsCount(page, {
                dashcardIndex: 0,
                dashboardCount: 1077,
                queryBuilderCount: "Showing 1,077 rows",
              });

              await goBackToDashboard(page);

              await verifyDashcardRowsCount(page, {
                dashcardIndex: 1,
                dashboardCount: 1077,
                queryBuilderCount: "Showing 1,077 rows",
              });

              await goBackToDashboard(page);

              await verifyDashcardRowsCount(page, {
                dashcardIndex: 2,
                dashboardCount: 1077,
                queryBuilderCount: "Showing 1,077 rows",
              });

              await goBackToDashboard(page);

              await verifyDashcardRowsCount(page, {
                dashcardIndex: 3,
                dashboardCount: 1077,
                queryBuilderCount: "Showing 1,077 rows",
              });

              // public dashboard
              const pubWait = waitForPublicDashboardData(page, 4);
              await visitPublicDashboard(page, mb, dashboardId);
              await pubWait;
              const pubWait2 = waitForPublicDashboardData(page, 2);
              await apply2ndStageBreakoutFilter(page);
              await pubWait2;

              await assertDashcardRowsCount(page, 0, 1077);
              await assertDashcardRowsCount(page, 1, 1077);
              await assertDashcardRowsCount(page, 2, 1077);
              await assertDashcardRowsCount(page, 3, 1077);

              // embedded dashboard
              const embWait = waitForEmbeddedDashboardData(page, 4);
              await visitEmbeddedPage(page, mb, {
                resource: { dashboard: dashboardId },
                params: {},
              });
              await embWait;
              const embWait2 = waitForEmbeddedDashboardData(page, 2);
              await apply2ndStageBreakoutFilter(page);
              await embWait2;

              await assertDashcardRowsCount(page, 0, 1077);
              await assertDashcardRowsCount(page, 1, 1077);
              await assertDashcardRowsCount(page, 2, 1077);
              await assertDashcardRowsCount(page, 3, 1077);
            });
          },
        );
      },
    );
  });
});
