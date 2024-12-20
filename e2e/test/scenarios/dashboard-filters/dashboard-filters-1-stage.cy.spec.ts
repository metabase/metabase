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

  describe("1-stage queries", () => {
    describe("Q1 - join, custom column, no aggregations, no breakouts", () => {
      beforeEach(() => {
        QSHelpers.createAndVisitDashboardWithCardMatrix(
          QSHelpers.createQ1Query,
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
              ["Reviews", QSHelpers.REVIEWS_DATE_COLUMNS],
              [
                "Product",
                [
                  ...QSHelpers.PRODUCTS_DATE_COLUMNS,
                  ...QSHelpers.PRODUCTS_DATE_COLUMNS,
                ],
              ], // TODO: https://github.com/metabase/metabase/issues/46845
              ["User", QSHelpers.PEOPLE_DATE_COLUMNS],
            ],
          );
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.MODEL_BASED_QUESTION_INDEX,
            [
              ["Base Orders Model", QSHelpers.ORDERS_DATE_COLUMNS],
              ["Reviews", QSHelpers.REVIEWS_DATE_COLUMNS],
              [
                "Product",
                [
                  ...QSHelpers.PRODUCTS_DATE_COLUMNS,
                  ...QSHelpers.PRODUCTS_DATE_COLUMNS,
                ],
              ], // TODO: https://github.com/metabase/metabase/issues/46845
              ["User", QSHelpers.PEOPLE_DATE_COLUMNS],
            ],
          );
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.QUESTION_BASED_MODEL_INDEX,
            [
              [
                "Question-based Model",
                [
                  ...QSHelpers.ORDERS_DATE_COLUMNS,
                  "Reviews - Product → Created At",
                ],
              ],
              ["Product", QSHelpers.PRODUCTS_DATE_COLUMNS],
              ["Reviews - Product → Product", QSHelpers.PRODUCTS_DATE_COLUMNS],
              ["User", QSHelpers.PEOPLE_DATE_COLUMNS],
            ],
          );
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.MODEL_BASED_MODEL_INDEX,
            [
              [
                "Model-based Model",
                [
                  ...QSHelpers.ORDERS_DATE_COLUMNS,
                  "Reviews - Product → Created At",
                ],
              ],
              ["Product", QSHelpers.PRODUCTS_DATE_COLUMNS],
              ["Reviews - Product → Product", QSHelpers.PRODUCTS_DATE_COLUMNS],
              ["User", QSHelpers.PEOPLE_DATE_COLUMNS],
            ],
          );
        }

        function verifyTextMappingOptions() {
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.QUESTION_BASED_QUESTION_INDEX,
            [
              ["Reviews", QSHelpers.REVIEWS_TEXT_COLUMNS],
              [
                "Product",
                [
                  ...QSHelpers.PRODUCTS_TEXT_COLUMNS,
                  ...QSHelpers.PRODUCTS_TEXT_COLUMNS,
                ],
              ], // TODO: https://github.com/metabase/metabase/issues/46845
              ["User", QSHelpers.PEOPLE_TEXT_COLUMNS],
            ],
          );
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.MODEL_BASED_QUESTION_INDEX,
            [
              ["Reviews", QSHelpers.REVIEWS_TEXT_COLUMNS],
              [
                "Product",
                [
                  ...QSHelpers.PRODUCTS_TEXT_COLUMNS,
                  ...QSHelpers.PRODUCTS_TEXT_COLUMNS,
                ],
              ], // TODO: https://github.com/metabase/metabase/issues/46845
              ["User", QSHelpers.PEOPLE_TEXT_COLUMNS],
            ],
          );
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.QUESTION_BASED_MODEL_INDEX,
            [
              [
                "Question-based Model",
                ["Reviews - Product → Reviewer", "Reviews - Product → Body"],
              ],
              ["Product", QSHelpers.PRODUCTS_TEXT_COLUMNS],
              ["Reviews - Product → Product", QSHelpers.PRODUCTS_TEXT_COLUMNS],
              ["User", QSHelpers.PEOPLE_TEXT_COLUMNS],
            ],
          );
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.MODEL_BASED_MODEL_INDEX,
            [
              [
                "Model-based Model",
                ["Reviews - Product → Reviewer", "Reviews - Product → Body"],
              ],
              ["Product", QSHelpers.PRODUCTS_TEXT_COLUMNS],
              ["Reviews - Product → Product", QSHelpers.PRODUCTS_TEXT_COLUMNS],
              ["User", QSHelpers.PEOPLE_TEXT_COLUMNS],
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
              ["Reviews", QSHelpers.REVIEWS_NUMBER_COLUMNS],
              [
                "Product",
                [
                  ...QSHelpers.PRODUCTS_NUMBER_COLUMNS,
                  ...QSHelpers.PRODUCTS_NUMBER_COLUMNS,
                ], // TODO: https://github.com/metabase/metabase/issues/46845
              ],
              ["User", QSHelpers.PEOPLE_NUMBER_COLUMNS],
            ],
          );
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.MODEL_BASED_QUESTION_INDEX,
            [
              [
                "Base Orders Model",
                [...QSHelpers.ORDERS_NUMBER_COLUMNS, "Net"],
              ],
              ["Reviews", QSHelpers.REVIEWS_NUMBER_COLUMNS],
              [
                "Product",
                [
                  ...QSHelpers.PRODUCTS_NUMBER_COLUMNS,
                  ...QSHelpers.PRODUCTS_NUMBER_COLUMNS,
                ], // TODO: https://github.com/metabase/metabase/issues/46845
              ],
              ["User", QSHelpers.PEOPLE_NUMBER_COLUMNS],
            ],
          );
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.QUESTION_BASED_MODEL_INDEX,
            [
              [
                "Question-based Model",
                [
                  ...QSHelpers.ORDERS_NUMBER_COLUMNS,
                  "Net",
                  "Reviews - Product → Rating",
                ],
              ],
              ["Product", QSHelpers.PRODUCTS_NUMBER_COLUMNS],
              [
                "Reviews - Product → Product",
                QSHelpers.PRODUCTS_NUMBER_COLUMNS,
              ],
              ["User", QSHelpers.PEOPLE_NUMBER_COLUMNS],
            ],
          );
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.MODEL_BASED_MODEL_INDEX,
            [
              [
                "Model-based Model",
                [
                  ...QSHelpers.ORDERS_NUMBER_COLUMNS,
                  "Net",
                  "Reviews - Product → Rating",
                ],
              ],
              ["Product", QSHelpers.PRODUCTS_NUMBER_COLUMNS],
              [
                "Reviews - Product → Product",
                QSHelpers.PRODUCTS_NUMBER_COLUMNS,
              ],
              ["User", QSHelpers.PEOPLE_NUMBER_COLUMNS],
            ],
          );
        }
      });
    });

    describe("Q2 - join, custom column, 2 aggregations, no breakouts", () => {
      beforeEach(() => {
        QSHelpers.createAndVisitDashboardWithCardMatrix(
          QSHelpers.createQ2Query,
        );
      });

      it("allows to map to all relevant columns (metabase#47184)", () => {
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
              ["Reviews", QSHelpers.REVIEWS_DATE_COLUMNS],
              [
                "Product",
                [
                  ...QSHelpers.PRODUCTS_DATE_COLUMNS,
                  ...QSHelpers.PRODUCTS_DATE_COLUMNS,
                ],
              ], // TODO: https://github.com/metabase/metabase/issues/46845
              ["User", QSHelpers.PEOPLE_DATE_COLUMNS],
            ],
          );
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.MODEL_BASED_QUESTION_INDEX,
            [
              ["Base Orders Model", QSHelpers.ORDERS_DATE_COLUMNS],
              ["Reviews", QSHelpers.REVIEWS_DATE_COLUMNS],
              [
                "Product",
                [
                  ...QSHelpers.PRODUCTS_DATE_COLUMNS,
                  ...QSHelpers.PRODUCTS_DATE_COLUMNS,
                ],
              ], // TODO: https://github.com/metabase/metabase/issues/46845
              ["User", QSHelpers.PEOPLE_DATE_COLUMNS],
            ],
          );
          QSHelpers.verifyNoDashcardMappingOptions(2);
          QSHelpers.verifyNoDashcardMappingOptions(3);
        }

        function verifyTextMappingOptions() {
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.QUESTION_BASED_QUESTION_INDEX,
            [
              ["Reviews", QSHelpers.REVIEWS_TEXT_COLUMNS],
              [
                "Product",
                [
                  ...QSHelpers.PRODUCTS_TEXT_COLUMNS,
                  ...QSHelpers.PRODUCTS_TEXT_COLUMNS,
                ],
              ], // TODO: https://github.com/metabase/metabase/issues/46845
              ["User", QSHelpers.PEOPLE_TEXT_COLUMNS],
            ],
          );
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.MODEL_BASED_QUESTION_INDEX,
            [
              ["Reviews", QSHelpers.REVIEWS_TEXT_COLUMNS],
              [
                "Product",
                [
                  ...QSHelpers.PRODUCTS_TEXT_COLUMNS,
                  ...QSHelpers.PRODUCTS_TEXT_COLUMNS,
                ],
              ], // TODO: https://github.com/metabase/metabase/issues/46845
              ["User", QSHelpers.PEOPLE_TEXT_COLUMNS],
            ],
          );
          QSHelpers.verifyNoDashcardMappingOptions(2);
          QSHelpers.verifyNoDashcardMappingOptions(3);
        }

        function verifyNumberMappingOptions() {
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.QUESTION_BASED_QUESTION_INDEX,
            [
              [
                "Base Orders Question",
                [...QSHelpers.ORDERS_NUMBER_COLUMNS, "Net"],
              ],
              ["Reviews", QSHelpers.REVIEWS_NUMBER_COLUMNS],
              [
                "Product",
                [
                  ...QSHelpers.PRODUCTS_NUMBER_COLUMNS,
                  ...QSHelpers.PRODUCTS_NUMBER_COLUMNS,
                ],
              ], // TODO: https://github.com/metabase/metabase/issues/46845
              ["User", QSHelpers.PEOPLE_NUMBER_COLUMNS],
            ],
          );
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.MODEL_BASED_QUESTION_INDEX,
            [
              [
                "Base Orders Model",
                [...QSHelpers.ORDERS_NUMBER_COLUMNS, "Net"],
              ],
              ["Reviews", QSHelpers.REVIEWS_NUMBER_COLUMNS],
              [
                "Product",
                [
                  ...QSHelpers.PRODUCTS_NUMBER_COLUMNS,
                  ...QSHelpers.PRODUCTS_NUMBER_COLUMNS,
                ],
              ], // TODO: https://github.com/metabase/metabase/issues/46845
              ["User", QSHelpers.PEOPLE_NUMBER_COLUMNS],
            ],
          );
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.QUESTION_BASED_MODEL_INDEX,
            [[NAMELESS_SECTION, ["Count", "Sum of Total"]]],
          );
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.MODEL_BASED_MODEL_INDEX,
            [[NAMELESS_SECTION, ["Count", "Sum of Total"]]],
          );
        }
      });
    });

    describe("Q3 - join, custom column, no aggregations, 3 breakouts", () => {
      beforeEach(() => {
        QSHelpers.createAndVisitDashboardWithCardMatrix(
          QSHelpers.createQ3Query,
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
              ["Reviews", QSHelpers.REVIEWS_DATE_COLUMNS],
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
              ["Reviews", QSHelpers.REVIEWS_DATE_COLUMNS],
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
            [
              [
                NAMELESS_SECTION,
                ["Created At: Month", "User → Created At: Year"],
              ],
            ],
          );
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.MODEL_BASED_MODEL_INDEX,
            [
              [
                NAMELESS_SECTION,
                ["Created At: Month", "User → Created At: Year"],
              ],
            ],
          );
        }

        function verifyTextMappingOptions() {
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.QUESTION_BASED_QUESTION_INDEX,
            [
              ["Reviews", QSHelpers.REVIEWS_TEXT_COLUMNS],
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
              ["Reviews", QSHelpers.REVIEWS_TEXT_COLUMNS],
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
            [[NAMELESS_SECTION, ["Product → Category"]]],
          );
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.MODEL_BASED_MODEL_INDEX,
            [[NAMELESS_SECTION, ["Product → Category"]]],
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
              ["Reviews", QSHelpers.REVIEWS_NUMBER_COLUMNS],
              [
                "Product",
                [
                  ...QSHelpers.PRODUCTS_NUMBER_COLUMNS,
                  ...QSHelpers.PRODUCTS_NUMBER_COLUMNS,
                ],
              ], // TODO: https://github.com/metabase/metabase/issues/46845
              ["User", QSHelpers.PEOPLE_NUMBER_COLUMNS],
            ],
          );
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.MODEL_BASED_QUESTION_INDEX,
            [
              [
                "Base Orders Model",
                [...QSHelpers.ORDERS_NUMBER_COLUMNS, "Net"],
              ],
              ["Reviews", QSHelpers.REVIEWS_NUMBER_COLUMNS],
              [
                "Product",
                [
                  ...QSHelpers.PRODUCTS_NUMBER_COLUMNS,
                  ...QSHelpers.PRODUCTS_NUMBER_COLUMNS,
                ],
              ], // TODO: https://github.com/metabase/metabase/issues/46845
              ["User", QSHelpers.PEOPLE_NUMBER_COLUMNS],
            ],
          );
          QSHelpers.verifyNoDashcardMappingOptions(2);
          QSHelpers.verifyNoDashcardMappingOptions(3);
        }
      });
    });

    describe("Q4 - join, custom column, 2 aggregations, 2 breakouts (metabase#47184)", () => {
      beforeEach(() => {
        QSHelpers.createAndVisitDashboardWithCardMatrix(
          QSHelpers.createQ4Query,
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
              ["Reviews", QSHelpers.REVIEWS_DATE_COLUMNS],
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
              ["Reviews", QSHelpers.REVIEWS_DATE_COLUMNS],
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
            [
              [
                NAMELESS_SECTION,
                ["Created At: Month", "User → Created At: Year"],
              ],
            ],
          );
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.MODEL_BASED_MODEL_INDEX,
            [
              [
                NAMELESS_SECTION,
                ["Created At: Month", "User → Created At: Year"],
              ],
            ],
          );
        }

        function verifyTextMappingOptions() {
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.QUESTION_BASED_QUESTION_INDEX,
            [
              ["Reviews", QSHelpers.REVIEWS_TEXT_COLUMNS],
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
              ["Reviews", QSHelpers.REVIEWS_TEXT_COLUMNS],
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
            [[NAMELESS_SECTION, ["Product → Category"]]],
          );
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.MODEL_BASED_MODEL_INDEX,
            [[NAMELESS_SECTION, ["Product → Category"]]],
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
              ["Reviews", QSHelpers.REVIEWS_NUMBER_COLUMNS],
              [
                "Product",
                [
                  ...QSHelpers.PRODUCTS_NUMBER_COLUMNS,
                  ...QSHelpers.PRODUCTS_NUMBER_COLUMNS,
                ],
              ], // TODO: https://github.com/metabase/metabase/issues/46845
              ["User", QSHelpers.PEOPLE_NUMBER_COLUMNS],
              ["Summaries", ["Count", "Sum of Total"]],
            ],
          );
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.MODEL_BASED_QUESTION_INDEX,
            [
              [
                "Base Orders Model",
                [...QSHelpers.ORDERS_NUMBER_COLUMNS, "Net"],
              ],
              ["Reviews", QSHelpers.REVIEWS_NUMBER_COLUMNS],
              [
                "Product",
                [
                  ...QSHelpers.PRODUCTS_NUMBER_COLUMNS,
                  ...QSHelpers.PRODUCTS_NUMBER_COLUMNS,
                ],
              ], // TODO: https://github.com/metabase/metabase/issues/46845
              ["User", QSHelpers.PEOPLE_NUMBER_COLUMNS],
              ["Summaries", ["Count", "Sum of Total"]],
            ],
          );
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.QUESTION_BASED_MODEL_INDEX,
            [[NAMELESS_SECTION, ["Count", "Sum of Total"]]],
          );
          QSHelpers.verifyDashcardMappingOptions(
            QSHelpers.MODEL_BASED_MODEL_INDEX,
            [[NAMELESS_SECTION, ["Count", "Sum of Total"]]],
          );
        }
      });
    });
  });
});
