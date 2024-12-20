import { H } from "e2e/support";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import type { Card, StructuredQuery } from "metabase-types/api";

import * as QSHelpers from "./shared/dashboard-filters-query-stages";

const { ORDERS, PRODUCTS } = SAMPLE_DATABASE;

describe("scenarios > dashboard > filters > query stages + temporal unit parameters", () => {
  describe("applies filter to the the dashcard and allows to drill via dashcard header", () => {
    beforeEach(() => {
      H.restore();
      cy.signInAsAdmin();

      cy.intercept("POST", "/api/dataset").as("dataset");
    });

    it("1st stage explicit join + unit of time parameter", () => {
      H.createDashboard(
        {
          name: "My new dashboard",
        },
        { wrapId: true, idAlias: "myNewDash" },
      );

      cy.get("@myNewDash").then((dashId: number | any) => {
        cy.request("POST", "/api/activity/recents", {
          context: "selection",
          model: "dashboard",
          model_id: dashId,
        });
      });

      H.startNewQuestion();

      H.entityPickerModal().within(() => {
        H.entityPickerModalTab("Tables").click();
        H.entityPickerModalItem(2, "Orders").click();
      });

      H.getNotebookStep("filter")
        .findByText("Add filters to narrow your answer")
        .click();
      H.popover().within(() => {
        cy.findByText("Orders").click();
        cy.findByText("Product").click();
        cy.findByText("Category").click();
        cy.findByLabelText("Gizmo").click();
        cy.findByLabelText("Doohickey").click();
        cy.button("Add filter").click();
      });

      H.getNotebookStep("summarize")
        .findByText("Pick a function or metric")
        .click();
      H.popover().findByText("Count of rows").click();
      H.getNotebookStep("summarize").icon("add").click();
      H.popover().within(() => {
        cy.findByText("Sum of ...").click();
        cy.findByText("Total").click();
      });

      H.getNotebookStep("summarize")
        .findByText("Pick a column to group by")
        .click();
      H.popover()
        .findByLabelText("Created At")
        .findByLabelText("Temporal bucket")
        .click();
      H.popover().last().findByText("Week").click();
      H.getNotebookStep("summarize")
        .findByTestId("breakout-step")
        .icon("add")
        .click();
      H.popover().within(() => {
        cy.findByText("Orders").click();
        cy.findByText("Product").click();
        cy.findByText("Category").click();
      });

      cy.findAllByTestId("action-buttons").last().button("Summarize").click();
      H.popover().findByText("Count of rows").click();
      H.getNotebookStep("summarize", { stage: 1 })
        .findByText("Pick a column to group by")
        .click();
      H.popover().findByLabelText("Created At: Week").click();

      H.visualize(); // need to visualize because startNewQuestion does not set "display" property on a card
      cy.wait("@dataset");
      H.saveQuestion("test"); // added to new dash automatically

      cy.findByLabelText("Add a filter or parameter").click();
      H.popover().findByText("Text or Category").click();
      H.getDashboardCard().findByText("Select…").click();
      cy.findAllByText("Category").first().click();

      cy.findByLabelText("Add a filter or parameter").click();
      H.popover().findByText("Time grouping").click();
      H.getDashboardCard().findByText("Select…").click();
      H.popover().findByText("Created At: Week").click();

      H.saveDashboard();
      H.filterWidget().eq(0).click();
      H.popover().within(() => {
        cy.findByText("Gizmo").click();
        cy.button("Add filter").click();
      });

      H.filterWidget().eq(1).click();
      H.popover().findByText("Quarter").click();

      H.getDashboardCard().findByText("Q1 2023").should("be.visible");
      H.getDashboardCard().findByTestId("legend-caption-title").click();
      cy.wait("@dataset");

      // assert that new filter was applied
      cy.findByTestId("qb-filters-panel").within(() => {
        cy.findByText("Product → Category is 2 selections").should(
          "be.visible",
        );
        cy.findByText("Product → Category is Gizmo").should("be.visible");
      });

      // assert that temporal unit parameter was applied
      cy.findByTestId("chart-container")
        .findByText("Q1 2023")
        .should("be.visible");
    });
  });
});

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
      }).then(response => {
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

    cy.button("Save").click();

    cy.log("filter modal");

    H.getDashboardCard(QUESTION_PIVOT_INDEX)
      .findByTestId("legend-caption-title")
      .click();
    cy.wait("@datasetPivot");
    cy.button("Filter").click();
    H.modal().findByText("Summaries").should("not.exist");

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
