const { H } = cy;

import * as QSHelpers from "./shared/dashboard-filters-query-stages";

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
    describe("Q5 - Q4 + 2nd stage with join, custom column, no aggregations, no breakouts", () => {
      beforeEach(() => {
        QSHelpers.createAndVisitDashboardWithCardMatrix(
          QSHelpers.createQ5Query,
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
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.QUESTION_BASED_MODEL_INDEX,
            [[null, ["Created At: Month", "User → Created At: Year"]]],
          );
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.MODEL_BASED_MODEL_INDEX,
            [[null, ["Created At: Month", "User → Created At: Year"]]],
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
              ],
              [
                "Product",
                [
                  ...QSHelpers.PRODUCTS_TEXT_COLUMNS,
                  ...QSHelpers.PRODUCTS_TEXT_COLUMNS,
                ],
              ], // TODO: https://github.com/metabase/metabase/issues/46845
              ["User", QSHelpers.PEOPLE_TEXT_COLUMNS],
              ["Summaries", ["Category"]],
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
              ],
              [
                "Product",
                [
                  ...QSHelpers.PRODUCTS_TEXT_COLUMNS,
                  ...QSHelpers.PRODUCTS_TEXT_COLUMNS,
                ],
              ], // TODO: https://github.com/metabase/metabase/issues/46845
              ["User", QSHelpers.PEOPLE_TEXT_COLUMNS],
              ["Summaries", ["Category"]],
            ],
          );
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.QUESTION_BASED_MODEL_INDEX,
            [[null, ["Product → Category"]]],
          );
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.MODEL_BASED_MODEL_INDEX,
            [[null, ["Product → Category"]]],
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
              ],
              [
                "Product",
                [
                  ...QSHelpers.PRODUCTS_NUMBER_COLUMNS,
                  ...QSHelpers.PRODUCTS_NUMBER_COLUMNS,
                ], // TODO: https://github.com/metabase/metabase/issues/46845
              ],
              ["User", QSHelpers.PEOPLE_NUMBER_COLUMNS],
              ["Summaries", ["Count", "Sum of Total", "5 * Count"]],
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
              ],
              [
                "Product",
                [
                  ...QSHelpers.PRODUCTS_NUMBER_COLUMNS,
                  ...QSHelpers.PRODUCTS_NUMBER_COLUMNS,
                ], // TODO: https://github.com/metabase/metabase/issues/46845
              ],
              ["User", QSHelpers.PEOPLE_NUMBER_COLUMNS],
              ["Summaries", ["Count", "Sum of Total", "5 * Count"]],
            ],
          );
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.QUESTION_BASED_MODEL_INDEX,
            [[null, ["Count", "Sum of Total", "5 * Count"]]],
          );
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.MODEL_BASED_MODEL_INDEX,
            [[null, ["Count", "Sum of Total", "5 * Count"]]],
          );
        }
      });
    });
  });
});
