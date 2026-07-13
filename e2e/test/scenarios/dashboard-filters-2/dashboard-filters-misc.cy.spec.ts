const { H } = cy;
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { Card, StructuredQuery } from "metabase-types/api";

import * as QSHelpers from "./shared/dashboard-filters-query-stages";

const { ORDERS, PRODUCTS } = SAMPLE_DATABASE;

describe("pivot tables", () => {
  const QUESTION_PIVOT_INDEX = 0;

  beforeEach(() => {
    H.restore();
    cy.signInAsAdmin();
    QSHelpers.createBaseQuestions();

    cy.intercept("POST", "/api/dataset").as("dataset");
    cy.intercept("POST", "/api/dataset/pivot").as("datasetPivot");
    cy.intercept("GET", "/api/dashboard/**").as("getDashboard");
    cy.intercept("POST", "/api/card/*/query").as("cardQuery");

    cy.then(function () {
      H.createQuestion({
        type: "question",
        query: createPivotableQuery(this.baseQuestion),
        name: "Question - pivot viz",
        display: "pivot",
      }).then((response) => {
        const card = response.body;
        QSHelpers.createAndVisitDashboard([card]);
      });
    });

    function createPivotableQuery(source: Card): StructuredQuery {
      return {
        ...QSHelpers.createQ1Query(source),
        aggregation: [["count"]],
        breakout: [
          [
            "field",
            ORDERS.CREATED_AT,
            {
              "base-type": "type/DateTime",
              "temporal-unit": "month",
            },
          ],
          [
            "field",
            PRODUCTS.CATEGORY,
            {
              "base-type": "type/Text",
              "source-field": ORDERS.PRODUCT_ID,
            },
          ],
        ],
      };
    }
  });

  it("does not use extra filtering stage for pivot tables", () => {
    cy.log("dashboard parameters mapping");

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

    // This test only inspects parameter mapping options without changing any
    // mappings, so saving issues no dashboard PUT. Use awaitRequest: false so we
    // deterministically exit to view mode (edit bar gone) without waiting on a
    // saveDashboardCards request that never fires — while still guaranteeing the
    // subsequent legend-caption drill lands in view mode, where it triggers the
    // pivot query.
    H.saveDashboard({ awaitRequest: false });

    cy.log("filter picker");

    // After exiting edit mode the pivot dashcard re-renders and re-runs its
    // query. Until that finishes the dashcard title isn't wired to open the
    // question — its click handler is only attached once the card series has
    // loaded — so clicking it too early navigates nowhere and the pivot query
    // never fires. Wait for the card to finish loading before clicking.
    H.getDashboardCard(QUESTION_PIVOT_INDEX)
      .findByTestId("legend-caption-title")
      .should("be.visible");
    H.getDashboardCard(QUESTION_PIVOT_INDEX)
      .findByTestId("loading-indicator")
      .should("not.exist");

    H.getDashboardCard(QUESTION_PIVOT_INDEX)
      .findByTestId("legend-caption-title")
      .click();
    // Clicking the title navigates to an ad-hoc QB, which must boot the route,
    // load table metadata, and only then issue /api/dataset/pivot. Under network
    // throttling that whole chain can exceed cy.wait's default 5s timeout (the
    // request does fire — just late), so give the alias a throttle-tolerant
    // window instead of asserting on the default.
    cy.wait("@datasetPivot", { timeout: 30000 });
    cy.findByTestId("qb-header")
      .button(/Filter/)
      .click();
    H.popover().findByText("Summaries").should("not.exist");

    function verifyDateMappingOptions() {
      QSHelpers.verifyDashcardMappingOptions(QUESTION_PIVOT_INDEX, [
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
      ]);
    }

    function verifyTextMappingOptions() {
      QSHelpers.verifyDashcardMappingOptions(QUESTION_PIVOT_INDEX, [
        ["Reviews", QSHelpers.REVIEWS_TEXT_COLUMNS],
        [
          "Product",
          [
            ...QSHelpers.PRODUCTS_TEXT_COLUMNS,
            ...QSHelpers.PRODUCTS_TEXT_COLUMNS,
          ],
        ], // TODO: https://github.com/metabase/metabase/issues/46845
        ["User", QSHelpers.PEOPLE_TEXT_COLUMNS],
      ]);
    }

    function verifyNumberMappingOptions() {
      QSHelpers.verifyDashcardMappingOptions(QUESTION_PIVOT_INDEX, [
        ["Base Orders Question", [...QSHelpers.ORDERS_NUMBER_COLUMNS, "Net"]],
        ["Reviews", QSHelpers.REVIEWS_NUMBER_COLUMNS],
        [
          "Product",
          [
            ...QSHelpers.PRODUCTS_NUMBER_COLUMNS,
            ...QSHelpers.PRODUCTS_NUMBER_COLUMNS,
          ],
        ], // TODO: https://github.com/metabase/metabase/issues/46845
        ["User", QSHelpers.PEOPLE_NUMBER_COLUMNS],
      ]);
    }
  });
});
