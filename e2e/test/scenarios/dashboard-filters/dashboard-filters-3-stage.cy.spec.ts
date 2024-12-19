import { H } from "e2e/support";

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

  describe("3-stage queries", () => {
    describe("Q9 - Q8 + 3rd stage with 1 aggregation", () => {
      beforeEach(() => {
        QSHelpers.createAndVisitDashboardWithCardMatrix(
          QSHelpers.createQ9Query,
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
          QSHelpers.verifyNoDashcardMappingOptions(
            QSHelpers.QUESTION_BASED_MODEL_INDEX,
          );
          QSHelpers.verifyNoDashcardMappingOptions(
            QSHelpers.MODEL_BASED_MODEL_INDEX,
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
            [[NAMELESS_SECTION, ["Count"]]],
          );
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.MODEL_BASED_MODEL_INDEX,
            [[NAMELESS_SECTION, ["Count"]]],
          );
        }
      });

      describe("applies filter to the the dashcard and allows to drill via dashcard header", () => {
        it("1st stage explicit join", () => {
          QSHelpers.setup1stStageExplicitJoinFilter();
          QSHelpers.apply1stStageExplicitJoinFilter();
          cy.wait(["@dashboardData", "@dashboardData"]);

          QSHelpers.verifyDashcardCellValues({
            dashcardIndex: 0,
            values: ["953"],
          });

          QSHelpers.goBackToDashboard();

          QSHelpers.verifyDashcardCellValues({
            dashcardIndex: 1,
            values: ["953"],
          });
        });

        it("1st stage implicit join (data source)", () => {
          QSHelpers.setup1stStageImplicitJoinFromSourceFilter();

          QSHelpers.verifyDashcardCellValues({
            dashcardIndex: 0,
            values: ["1,044"],
          });

          QSHelpers.goBackToDashboard();

          QSHelpers.verifyDashcardCellValues({
            dashcardIndex: 1,
            values: ["1,044"],
          });
        });

        // TODO: https://github.com/metabase/metabase/issues/46774
        it.skip("1st stage implicit join (joined data source)", () => {
          QSHelpers.setup1stStageImplicitJoinFromJoinFilter();

          QSHelpers.verifyDashcardCellValues({
            dashcardIndex: 0,
            values: ["1,077"],
          });

          QSHelpers.goBackToDashboard();

          QSHelpers.verifyDashcardCellValues({
            dashcardIndex: 1,
            values: ["1,077"],
          });
        });

        it("1st stage custom column", () => {
          QSHelpers.setup1stStageCustomColumnFilter();

          QSHelpers.verifyDashcardCellValues({
            dashcardIndex: 0,
            values: ["688"],
          });

          QSHelpers.goBackToDashboard();

          QSHelpers.verifyDashcardCellValues({
            dashcardIndex: 1,
            values: ["688"],
          });
        });

        it("1st stage aggregation", () => {
          QSHelpers.setup1stStageAggregationFilter();

          QSHelpers.verifyDashcardCellValues({
            dashcardIndex: 0,
            values: ["3"],
          });

          QSHelpers.goBackToDashboard();

          QSHelpers.verifyDashcardCellValues({
            dashcardIndex: 1,
            values: ["3"],
          });
        });

        // TODO: https://github.com/metabase/metabase/issues/46774
        it.skip("1st stage breakout", () => {
          QSHelpers.setup1stStageBreakoutFilter();

          QSHelpers.verifyDashcardCellValues({
            dashcardIndex: 0,
            values: ["1,077"],
          });

          QSHelpers.goBackToDashboard();

          QSHelpers.verifyDashcardCellValues({
            dashcardIndex: 1,
            values: ["1,077"],
          });
        });

        it("2nd stage explicit join", () => {
          QSHelpers.setup2ndStageExplicitJoinFilter();

          QSHelpers.verifyDashcardCellValues({
            dashcardIndex: 0,
            values: ["4"],
          });

          QSHelpers.goBackToDashboard();

          QSHelpers.verifyDashcardCellValues({
            dashcardIndex: 1,
            values: ["4"],
          });
        });

        it("2nd stage custom column", () => {
          QSHelpers.setup2ndStageCustomColumnFilter();
          QSHelpers.apply2ndStageCustomColumnFilter();
          cy.wait(["@dashboardData", "@dashboardData"]);

          QSHelpers.verifyDashcardCellValues({
            dashcardIndex: 0,
            values: ["31"],
          });

          QSHelpers.goBackToDashboard();

          QSHelpers.verifyDashcardCellValues({
            dashcardIndex: 1,
            values: ["31"],
          });
        });

        it("2nd stage aggregation", () => {
          QSHelpers.setup2ndStageAggregationFilter();
          QSHelpers.apply2ndStageAggregationFilter();
          cy.wait(["@dashboardData", "@dashboardData"]);

          QSHelpers.verifyDashcardCellValues({
            dashcardIndex: 0,
            values: ["6"],
          });

          QSHelpers.goBackToDashboard();

          QSHelpers.verifyDashcardCellValues({
            dashcardIndex: 1,
            values: ["6"],
          });
        });

        it("2nd stage breakout", () => {
          H.editDashboard();

          QSHelpers.getFilter("Text").click();

          H.getDashboardCard(0).findByText("Select…").click();
          H.popover().within(() => {
            QSHelpers.getPopoverList().scrollTo("bottom");
            QSHelpers.getPopoverItem("Category", 2).click();
          });

          H.getDashboardCard(1).findByText("Select…").click();
          H.popover().within(() => {
            QSHelpers.getPopoverList().scrollTo("bottom");
            QSHelpers.getPopoverItem("Category", 2).click();
          });

          cy.button("Save").click();
          cy.wait("@updateDashboard");

          H.filterWidget().eq(0).click();
          H.popover().within(() => {
            cy.findByLabelText("Gadget").click();
            cy.button("Add filter").click();
          });
          cy.wait(["@dashboardData", "@dashboardData"]);

          QSHelpers.verifyDashcardCellValues({
            dashcardIndex: 0,
            values: ["1,077"],
          });

          QSHelpers.goBackToDashboard();

          QSHelpers.verifyDashcardCellValues({
            dashcardIndex: 1,
            values: ["1,077"],
          });
        });
      });
    });
  });
});
