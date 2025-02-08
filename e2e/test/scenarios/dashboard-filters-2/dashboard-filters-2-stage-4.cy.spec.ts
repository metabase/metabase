const { H } = cy;

import * as QSHelpers from "./shared/dashboard-filters-query-stages";

/**
 * Empty section title element is rendered.
 * TODO: https://github.com/metabase/metabase/issues/47218
 */
const NAMELESS_SECTION = "";

/**
 * Abbreviations used for card aliases in this test suite:
 *  qbq = question-based question
 *  qbm = question-based model
 *  mbq = model-based question
 *  mbm = model-based model
 */
describe("scenarios > dashboard > filters > query stages", () => {
  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    QSHelpers.createBaseQuestions();

    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("GET", "/api/dashboard/**").as("getDashboard");
    cy.intercept("PUT", "/api/dashboard/**").as("updateDashboard");
    cy.intercept("POST", "/api/dashboard/*/dashcard/*/card/*/query").as(
      "dashboardData",
    );
    cy.intercept("GET", "/api/public/dashboard/*/dashcard/*/card/*").as(
      "publicDashboardData",
    );
    cy.intercept("GET", "/api/embed/dashboard/*/dashcard/*/card/*").as(
      "embeddedDashboardData",
    );
  });

  describe("2-stage queries", () => {
    describe("Q8 - Q4 + 2nd stage with join, custom column, 2 aggregations, 2 breakouts", () => {
      beforeEach(() => {
        QSHelpers.createAndVisitDashboardWithCardMatrix(
          QSHelpers.createQ8Query,
        );
      });

      it("allows to map to all relevant columns", () => {
        H.editDashboard();

        cy.log("## date columns");
        QSHelpers.getFilter("Date").click();
        verifyDateMappingOptions();

        cy.log("## text columns");
        QSHelpers.getFilter("Text").click();
        verifyTextMappingOptions();

        cy.log("## number columns");
        QSHelpers.getFilter("Number").click();
        verifyNumberMappingOptions();

        function verifyDateMappingOptions() {
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.QUESTION_BASED_QUESTION_INDEX,
            [
              ["Base Orders Question", QSHelpers.ORDERS_DATE_COLUMNS],
              [
                "Reviews",
                [
                  ...QSHelpers.REVIEWS_DATE_COLUMNS,
                  ...QSHelpers.REVIEWS_DATE_COLUMNS,
                ],
              ], // TODO: https://github.com/metabase/metabase/issues/46845
              [
                "Product",
                [
                  ...QSHelpers.PRODUCTS_DATE_COLUMNS,
                  ...QSHelpers.PRODUCTS_DATE_COLUMNS,
                ],
              ], // TODO: https://github.com/metabase/metabase/issues/46845
              ["User", QSHelpers.PEOPLE_DATE_COLUMNS],
              ["Summaries", ["Created At: Month", "Created At: Year"]],
            ],
          );
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.MODEL_BASED_QUESTION_INDEX,
            [
              ["Base Orders Model", QSHelpers.ORDERS_DATE_COLUMNS],
              [
                "Reviews",
                [
                  ...QSHelpers.REVIEWS_DATE_COLUMNS,
                  ...QSHelpers.REVIEWS_DATE_COLUMNS,
                ],
              ], // TODO: https://github.com/metabase/metabase/issues/46845
              [
                "Product",
                [
                  ...QSHelpers.PRODUCTS_DATE_COLUMNS,
                  ...QSHelpers.PRODUCTS_DATE_COLUMNS,
                ],
              ], // TODO: https://github.com/metabase/metabase/issues/46845
              ["User", QSHelpers.PEOPLE_DATE_COLUMNS],
              ["Summaries", ["Created At: Month", "Created At: Year"]],
            ],
          );
          QSHelpers.verifyNoDashcardMappingOptions(
            QSHelpers.QUESTION_BASED_MODEL_INDEX,
          );
          QSHelpers.verifyNoDashcardMappingOptions(
            QSHelpers.MODEL_BASED_MODEL_INDEX,
          );
        }

        function verifyTextMappingOptions() {
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.QUESTION_BASED_QUESTION_INDEX,
            [
              [
                "Reviews",
                [
                  ...QSHelpers.REVIEWS_TEXT_COLUMNS,
                  ...QSHelpers.REVIEWS_TEXT_COLUMNS,
                ],
              ], // TODO: https://github.com/metabase/metabase/issues/46845
              [
                "Product",
                [
                  ...QSHelpers.PRODUCTS_TEXT_COLUMNS,
                  ...QSHelpers.PRODUCTS_TEXT_COLUMNS,
                ],
              ], // TODO: https://github.com/metabase/metabase/issues/46845
              ["User", QSHelpers.PEOPLE_TEXT_COLUMNS],
              ["Summaries", ["Category"]],
              ["Summaries (2)", ["Reviewer", "Category"]],
            ],
          );
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.MODEL_BASED_QUESTION_INDEX,
            [
              [
                "Reviews",
                [
                  ...QSHelpers.REVIEWS_TEXT_COLUMNS,
                  ...QSHelpers.REVIEWS_TEXT_COLUMNS,
                ],
              ], // TODO: https://github.com/metabase/metabase/issues/46845
              [
                "Product",
                [
                  ...QSHelpers.PRODUCTS_TEXT_COLUMNS,
                  ...QSHelpers.PRODUCTS_TEXT_COLUMNS,
                ],
              ], // TODO: https://github.com/metabase/metabase/issues/46845
              ["User", QSHelpers.PEOPLE_TEXT_COLUMNS],
              ["Summaries", ["Category"]],
              ["Summaries (2)", ["Reviewer", "Category"]],
            ],
          );
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.QUESTION_BASED_MODEL_INDEX,
            [
              [
                NAMELESS_SECTION,
                [
                  "Reviews - Created At: Month → Reviewer",
                  "Products Via Product ID Category",
                ],
              ],
            ],
          );
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.MODEL_BASED_MODEL_INDEX,
            [
              [
                NAMELESS_SECTION,
                [
                  "Reviews - Created At: Month → Reviewer",
                  "Products Via Product ID Category",
                ],
              ],
            ],
          );
        }

        function verifyNumberMappingOptions() {
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.QUESTION_BASED_QUESTION_INDEX,
            [
              [
                "Base Orders Question",
                [...QSHelpers.ORDERS_NUMBER_COLUMNS, "Net"],
              ],
              [
                "Reviews",
                [
                  ...QSHelpers.REVIEWS_NUMBER_COLUMNS,
                  ...QSHelpers.REVIEWS_NUMBER_COLUMNS,
                ],
              ], // TODO: https://github.com/metabase/metabase/issues/46845
              [
                "Product",
                [
                  ...QSHelpers.PRODUCTS_NUMBER_COLUMNS,
                  ...QSHelpers.PRODUCTS_NUMBER_COLUMNS,
                ],
              ], // TODO: https://github.com/metabase/metabase/issues/46845
              ["User", QSHelpers.PEOPLE_NUMBER_COLUMNS],
              ["Summaries", ["Count", "Sum of Total", "5 * Count"]],
              ["Summaries (2)", ["Count", "Sum of Rating"]],
            ],
          );
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.MODEL_BASED_QUESTION_INDEX,
            [
              [
                "Base Orders Model",
                [...QSHelpers.ORDERS_NUMBER_COLUMNS, "Net"],
              ],
              [
                "Reviews",
                [
                  ...QSHelpers.REVIEWS_NUMBER_COLUMNS,
                  ...QSHelpers.REVIEWS_NUMBER_COLUMNS,
                ],
              ], // TODO: https://github.com/metabase/metabase/issues/46845
              [
                "Product",
                [
                  ...QSHelpers.PRODUCTS_NUMBER_COLUMNS,
                  ...QSHelpers.PRODUCTS_NUMBER_COLUMNS,
                ],
              ], // TODO: https://github.com/metabase/metabase/issues/46845
              ["User", QSHelpers.PEOPLE_NUMBER_COLUMNS],
              ["Summaries", ["Count", "Sum of Total", "5 * Count"]],
              ["Summaries (2)", ["Count", "Sum of Rating"]],
            ],
          );
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.QUESTION_BASED_MODEL_INDEX,
            [
              [
                NAMELESS_SECTION,
                ["Count", "Sum of Reviews - Created At: Month → Rating"],
              ],
            ],
          );
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.MODEL_BASED_MODEL_INDEX,
            [
              [
                NAMELESS_SECTION,
                ["Count", "Sum of Reviews - Created At: Month → Rating"],
              ],
            ],
          );
        }
      });

      describe("applies filter to the the dashcard and allows to drill via dashcard header", () => {
        it("1st stage explicit join", () => {
          QSHelpers.setup1stStageExplicitJoinFilter();
          QSHelpers.apply1stStageExplicitJoinFilter();
          cy.wait(["@dashboardData", "@dashboardData"]);

          QSHelpers.verifyDashcardRowsCount({
            dashcardIndex: 0,
            dashboardCount: "Rows 1-1 of 953",
            queryBuilderCount: "Showing 953 rows",
          });

          QSHelpers.goBackToDashboard();

          QSHelpers.verifyDashcardRowsCount({
            dashcardIndex: 1,
            dashboardCount: "Rows 1-1 of 953",
            queryBuilderCount: "Showing 953 rows",
          });

          cy.log("public dashboard");
          QSHelpers.getDashboardId().then(dashboardId =>
            H.visitPublicDashboard(dashboardId),
          );
          QSHelpers.waitForPublicDashboardData();
          QSHelpers.apply1stStageExplicitJoinFilter();
          QSHelpers.waitForPublicDashboardData();

          H.getDashboardCard(0)
            .findByText("Rows 1-1 of 953")
            .should("be.visible");
          H.getDashboardCard(1)
            .findByText("Rows 1-1 of 953")
            .should("be.visible");

          cy.log("embedded dashboard");
          QSHelpers.getDashboardId().then(dashboardId => {
            H.visitEmbeddedPage({
              resource: { dashboard: dashboardId },
              params: {},
            });
          });
          QSHelpers.waitForEmbeddedDashboardData();
          QSHelpers.apply1stStageExplicitJoinFilter();
          QSHelpers.waitForEmbeddedDashboardData();

          H.getDashboardCard(0)
            .findByText("Rows 1-1 of 953")
            .should("be.visible");
          H.getDashboardCard(1)
            .findByText("Rows 1-1 of 953")
            .should("be.visible");
        });

        it("1st stage implicit join (data source)", () => {
          QSHelpers.setup1stStageImplicitJoinFromSourceFilter();

          QSHelpers.verifyDashcardRowsCount({
            dashcardIndex: 0,
            dashboardCount: "Rows 1-1 of 1044",
            queryBuilderCount: "Showing 1,044 rows",
          });

          QSHelpers.goBackToDashboard();

          QSHelpers.verifyDashcardRowsCount({
            dashcardIndex: 1,
            dashboardCount: "Rows 1-1 of 1044",
            queryBuilderCount: "Showing 1,044 rows",
          });
        });

        // TODO: https://github.com/metabase/metabase/issues/46774
        it.skip("1st stage implicit join (joined data source)", () => {
          QSHelpers.setup1stStageImplicitJoinFromJoinFilter();

          QSHelpers.verifyDashcardRowsCount({
            dashcardIndex: 0,
            dashboardCount: "Rows 1-1 of 1077",
            queryBuilderCount: "Showing 1,077 rows",
          });

          QSHelpers.goBackToDashboard();

          QSHelpers.verifyDashcardRowsCount({
            dashcardIndex: 1,
            dashboardCount: "Rows 1-1 of 1077",
            queryBuilderCount: "Showing 1,077 rows",
          });
        });

        it("1st stage custom column", () => {
          QSHelpers.setup1stStageCustomColumnFilter();

          QSHelpers.verifyDashcardRowsCount({
            dashcardIndex: 0,
            dashboardCount: "Rows 1-1 of 688",
            queryBuilderCount: "Showing 688 rows",
          });

          QSHelpers.goBackToDashboard();

          QSHelpers.verifyDashcardRowsCount({
            dashcardIndex: 1,
            dashboardCount: "Rows 1-1 of 688",
            queryBuilderCount: "Showing 688 rows",
          });
        });

        it("1st stage aggregation", () => {
          QSHelpers.setup1stStageAggregationFilter();

          QSHelpers.verifyDashcardRowsCount({
            dashcardIndex: 1,
            dashboardCount: "Rows 1-1 of 3",
            queryBuilderCount: "Showing 3 rows",
          });

          QSHelpers.goBackToDashboard();

          QSHelpers.verifyDashcardRowsCount({
            dashcardIndex: 1,
            dashboardCount: "Rows 1-1 of 3",
            queryBuilderCount: "Showing 3 rows",
          });
        });

        // TODO: https://github.com/metabase/metabase/issues/46774
        it.skip("1st stage breakout", () => {
          QSHelpers.setup1stStageBreakoutFilter();

          QSHelpers.verifyDashcardRowsCount({
            dashcardIndex: 0,
            dashboardCount: "Rows 1-1 of 1077",
            queryBuilderCount: "Showing 1,077 rows",
          });

          QSHelpers.goBackToDashboard();

          QSHelpers.verifyDashcardRowsCount({
            dashcardIndex: 1,
            dashboardCount: "Rows 1-1 of 1077",
            queryBuilderCount: "Showing 1,077 rows",
          });
        });

        it("2nd stage explicit join", () => {
          QSHelpers.setup2ndStageExplicitJoinFilter();

          QSHelpers.verifyDashcardRowsCount({
            dashcardIndex: 0,
            dashboardCount: "Rows 1-1 of 4",
            queryBuilderCount: "Showing 4 rows",
          });

          QSHelpers.goBackToDashboard();

          QSHelpers.verifyDashcardRowsCount({
            dashcardIndex: 1,
            dashboardCount: "Rows 1-1 of 4",
            queryBuilderCount: "Showing 4 rows",
          });
        });

        it("2nd stage custom column", () => {
          QSHelpers.setup2ndStageCustomColumnFilter();
          QSHelpers.apply2ndStageCustomColumnFilter();
          cy.wait(["@dashboardData", "@dashboardData"]);

          QSHelpers.verifyDashcardRowsCount({
            dashcardIndex: 0,
            dashboardCount: "Rows 1-1 of 31",
            queryBuilderCount: "Showing 31 rows",
          });

          QSHelpers.goBackToDashboard();

          QSHelpers.verifyDashcardRowsCount({
            dashcardIndex: 1,
            dashboardCount: "Rows 1-1 of 31",
            queryBuilderCount: "Showing 31 rows",
          });

          cy.log("public dashboard");
          QSHelpers.getDashboardId().then(dashboardId =>
            H.visitPublicDashboard(dashboardId),
          );
          QSHelpers.waitForPublicDashboardData();
          QSHelpers.apply2ndStageCustomColumnFilter();
          QSHelpers.waitForPublicDashboardData();

          H.getDashboardCard(0)
            .findByText("Rows 1-1 of 31")
            .should("be.visible");
          H.getDashboardCard(1)
            .findByText("Rows 1-1 of 31")
            .should("be.visible");

          cy.log("embedded dashboard");
          QSHelpers.getDashboardId().then(dashboardId => {
            H.visitEmbeddedPage({
              resource: { dashboard: dashboardId },
              params: {},
            });
          });
          QSHelpers.waitForEmbeddedDashboardData();
          QSHelpers.apply2ndStageCustomColumnFilter();
          QSHelpers.waitForEmbeddedDashboardData();

          H.getDashboardCard(0)
            .findByText("Rows 1-1 of 31")
            .should("be.visible");
          H.getDashboardCard(1)
            .findByText("Rows 1-1 of 31")
            .should("be.visible");
        });

        it("2nd stage aggregation", () => {
          QSHelpers.setup2ndStageAggregationFilter();
          QSHelpers.apply2ndStageAggregationFilter();
          cy.wait(["@dashboardData", "@dashboardData"]);

          QSHelpers.verifyDashcardRowsCount({
            dashcardIndex: 0,
            dashboardCount: "Rows 1-1 of 6",
            queryBuilderCount: "Showing 6 rows",
          });

          QSHelpers.goBackToDashboard();

          QSHelpers.verifyDashcardRowsCount({
            dashcardIndex: 1,
            dashboardCount: "Rows 1-1 of 6",
            queryBuilderCount: "Showing 6 rows",
          });

          QSHelpers.goBackToDashboard();

          QSHelpers.verifyDashcardRowsCount({
            dashcardIndex: 2,
            dashboardCount: "Rows 1-1 of 6",
            queryBuilderCount: "Showing 6 rows",
          });

          QSHelpers.goBackToDashboard();

          QSHelpers.verifyDashcardRowsCount({
            dashcardIndex: 3,
            dashboardCount: "Rows 1-1 of 6",
            queryBuilderCount: "Showing 6 rows",
          });

          cy.log("public dashboard");
          QSHelpers.getDashboardId().then(dashboardId =>
            H.visitPublicDashboard(dashboardId),
          );
          QSHelpers.waitForPublicDashboardData();
          QSHelpers.apply2ndStageAggregationFilter();
          QSHelpers.waitForPublicDashboardData();

          H.getDashboardCard(0)
            .findByText("Rows 1-1 of 6")
            .should("be.visible");
          H.getDashboardCard(1)
            .findByText("Rows 1-1 of 6")
            .should("be.visible");
          H.getDashboardCard(2)
            .findByText("Rows 1-1 of 6")
            .should("be.visible");
          H.getDashboardCard(3)
            .findByText("Rows 1-1 of 6")
            .should("be.visible");

          cy.log("embedded dashboard");
          QSHelpers.getDashboardId().then(dashboardId => {
            H.visitEmbeddedPage({
              resource: { dashboard: dashboardId },
              params: {},
            });
          });
          QSHelpers.waitForEmbeddedDashboardData();
          QSHelpers.apply2ndStageAggregationFilter();
          QSHelpers.waitForEmbeddedDashboardData();

          H.getDashboardCard(0)
            .findByText("Rows 1-1 of 6")
            .should("be.visible");
          H.getDashboardCard(1)
            .findByText("Rows 1-1 of 6")
            .should("be.visible");
          H.getDashboardCard(2)
            .findByText("Rows 1-1 of 6")
            .should("be.visible");
          H.getDashboardCard(3)
            .findByText("Rows 1-1 of 6")
            .should("be.visible");
        });

        it("2nd stage breakout", () => {
          QSHelpers.setup2ndStageBreakoutFilter();
          QSHelpers.apply2ndStageBreakoutFilter();
          cy.wait(["@dashboardData", "@dashboardData"]);

          QSHelpers.verifyDashcardRowsCount({
            dashcardIndex: 0,
            dashboardCount: "Rows 1-1 of 1077",
            queryBuilderCount: "Showing 1,077 rows",
          });

          QSHelpers.goBackToDashboard();

          QSHelpers.verifyDashcardRowsCount({
            dashcardIndex: 1,
            dashboardCount: "Rows 1-1 of 1077",
            queryBuilderCount: "Showing 1,077 rows",
          });

          QSHelpers.goBackToDashboard();

          QSHelpers.verifyDashcardRowsCount({
            dashcardIndex: 2,
            dashboardCount: "Rows 1-1 of 1077",
            queryBuilderCount: "Showing 1,077 rows",
          });

          QSHelpers.goBackToDashboard();

          QSHelpers.verifyDashcardRowsCount({
            dashcardIndex: 3,
            dashboardCount: "Rows 1-1 of 1077",
            queryBuilderCount: "Showing 1,077 rows",
          });

          cy.log("public dashboard");
          QSHelpers.getDashboardId().then(dashboardId =>
            H.visitPublicDashboard(dashboardId),
          );
          QSHelpers.waitForPublicDashboardData();
          // We're not using apply2ndStageBreakoutFilter() here because in public dashboards
          // there are no field values to choose from. We need to search for those values manually.
          H.filterWidget().eq(0).click();
          H.popover().within(() => {
            cy.findByPlaceholderText("Enter some text").type("Gadget");
            cy.button("Add filter").click();
          });
          QSHelpers.waitForPublicDashboardData();

          H.getDashboardCard(0)
            .findByText("Rows 1-1 of 1077")
            .should("be.visible");
          H.getDashboardCard(1)
            .findByText("Rows 1-1 of 1077")
            .should("be.visible");
          H.getDashboardCard(2)
            .findByText("Rows 1-1 of 1077")
            .should("be.visible");
          H.getDashboardCard(3)
            .findByText("Rows 1-1 of 1077")
            .should("be.visible");

          cy.log("embedded dashboard");
          QSHelpers.getDashboardId().then(dashboardId => {
            H.visitEmbeddedPage({
              resource: { dashboard: dashboardId },
              params: {},
            });
          });
          QSHelpers.waitForEmbeddedDashboardData();
          // We're not using apply2ndStageBreakoutFilter() here because in public dashboards
          // there are no field values to choose from. We need to search for those values manually.
          H.filterWidget().eq(0).click();
          H.popover().within(() => {
            cy.findByPlaceholderText("Enter some text").type("Gadget");
            cy.button("Add filter").click();
          });
          QSHelpers.waitForEmbeddedDashboardData();

          H.getDashboardCard(0)
            .findByText("Rows 1-1 of 1077")
            .should("be.visible");
          H.getDashboardCard(1)
            .findByText("Rows 1-1 of 1077")
            .should("be.visible");
          H.getDashboardCard(2)
            .findByText("Rows 1-1 of 1077")
            .should("be.visible");
          H.getDashboardCard(3)
            .findByText("Rows 1-1 of 1077")
            .should("be.visible");
        });
      });
    });
  });
});
