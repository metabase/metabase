const { H } = cy;

import { WRITABLE_DB_ID } from "e2e/support/cypress_data";
import { SAMPLE_DATABASE } from "e2e/support/cypress_sample_database";
import { ORDERS_DASHBOARD_ID } from "e2e/support/cypress_sample_instance_data";

const { PRODUCTS_ID } = SAMPLE_DATABASE;

describe("scenarios > dependencies > dependency checks", () => {
  beforeEach(() => {
    H.restore("postgres-writable");
    H.resetTestTable({ type: "postgres", table: "many_schemas" });
    cy.signInAsAdmin();
    H.activateToken("bleeding-edge");
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: "Animals" });
    H.resetSnowplow();

    cy.intercept("PUT", "/api/card/*").as("updateCard");
    cy.intercept("PUT", "/api/native-query-snippet/*").as("updateSnippet");
  });

  afterEach(() => {
    H.expectNoBadSnowplowEvents();
  });

  describe("questions", () => {
    it("should be able to confirm or cancel breaking changes to a MBQL question", () => {
      createMbqlQuestionWithDependentMbqlQuestions();

      cy.log("make breaking changes");
      H.visitQuestion("@questionId");
      H.openNotebook();
      H.getNotebookStep("expression").findByText("Expr").icon("close").click();

      cy.log("cancel breaking changes");
      H.queryBuilderHeader().button("Save").click();
      H.modal().button("Save").click();
      H.modal().within(() => {
        cy.findByText("Question with fields").should("be.visible");
        cy.findByText("Question without fields").should("not.exist");
        cy.findByText("Base question").should("not.exist");
        cy.button("Cancel").click();
      });
      cy.get("@updateCard.all").should("have.length", 0);

      cy.log("confirm breaking changes");
      H.queryBuilderHeader().button("Save").click();
      H.modal().button("Save").click();
      H.modal().button("Save anyway").click();
      cy.wait("@updateCard");
    });

    it("should be able to navigate to affected questions or their collection", () => {
      createMbqlQuestionWithDependentMbqlQuestions();

      cy.log("check that we can navigate to the broken question");
      H.visitQuestion("@questionId");
      H.openNotebook();
      H.getNotebookStep("expression").findByText("Expr").icon("close").click();
      H.queryBuilderHeader().button("Save").click();
      H.modal().button("Save").click();
      H.modal().findByText("Question with fields").click();
      confirmDiscardChanges();
      H.queryBuilderHeader()
        .findByDisplayValue("Question with fields")
        .should("be.visible");

      cy.log("check that we can navigate to the collection of that question");
      cy.go("back");
      H.getNotebookStep("expression").findByText("Expr").icon("close").click();
      H.queryBuilderHeader().button("Save").click();
      H.modal().button("Save").click();
      H.modal().within(() => {
        cy.findByText("Question with fields").should("be.visible");
        cy.findByText("Our analytics").click();
      });
      confirmDiscardChanges();
      H.collectionTable().should("be.visible");

      cy.log("check that we can navigate to the dashboard of that question");
      cy.go("back");
      H.getNotebookStep("expression").findByText("Expr").icon("close").click();
      H.queryBuilderHeader().button("Save").click();
      H.modal().button("Save").click();
      H.modal().within(() => {
        cy.findByText("Question with fields").should("be.visible");
        cy.findByText("Orders in a dashboard").click();
      });
      confirmDiscardChanges();
      H.dashboardHeader().should("be.visible");
    });

    it("should not show a confirmation if there are no breaking changes when updating a MBQL question", () => {
      createMbqlQuestionWithDependentMbqlQuestions();
      H.visitQuestion("@questionId");
      H.openNotebook();
      H.getNotebookStep("expression").findByText("Expr").click();
      H.CustomExpressionEditor.clear().type("2 + 2");
      H.popover().button("Update").click();
      H.queryBuilderHeader().button("Save").click();
      H.modal().button("Save").click();
      cy.wait("@updateCard");
    });
  });

  describe("metrics", () => {
    it("should be able to confirm or cancel breaking changes to a metric", () => {
      createMetricWithDependentMbqlQuestions();

      cy.log("make breaking changes");
      cy.get<number>("@metricId").then(H.visitMetric);
      H.openQuestionActions("Edit metric definition");
      H.getNotebookStep("summarize").findByText("Min of Score").click();
      H.popover().within(() => {
        cy.icon("chevronleft").click();
        cy.findByText("Maximum of ...").click();
        cy.findByText("Score").click();
      });

      cy.log("cancel breaking changes");
      cy.findByTestId("edit-bar").button("Save changes").click();
      H.modal().within(() => {
        cy.findByText("Question with 2 stages").should("be.visible");
        cy.findByText("Question with 1 stage").should("not.exist");
        cy.findByText("Base metric").should("not.exist");
        cy.button("Cancel").click();
      });
      cy.get("@updateCard.all").should("have.length", 0);

      cy.log("confirm breaking changes");
      cy.findByTestId("edit-bar").button("Save changes").click();
      H.modal().button("Save anyway").click();
      cy.wait("@updateCard");
    });

    it("should not show a warning when a change to a metric is backward-compatible with existing content", () => {
      createMetricWithDependentMbqlQuestions();
      cy.get<number>("@metricId").then(H.visitMetric);
      H.openQuestionActions("Edit metric definition");
      H.getNotebookStep("summarize").findByText("Min of Score").click();
      H.popover().findByText("Name").click();
      cy.findByTestId("edit-bar").button("Save changes").click();
      cy.wait("@updateCard");
    });
  });

});

function createMbqlQuestionWithDependentMbqlQuestions() {
  H.createQuestion({
    name: "Base question",
    query: {
      "source-table": PRODUCTS_ID,
      expressions: {
        Expr: ["+", 1, 1],
      },
    },
  }).then(({ body: card }) => {
    cy.wrap(card.id).as("questionId");

    H.createQuestion({
      name: "Question with fields",
      query: {
        "source-table": `card__${card.id}`,
        filter: [">", ["field", "Expr", { "base-type": "type/Integer" }], 1],
      },
      dashboard_id: ORDERS_DASHBOARD_ID,
    });

    H.createQuestion({
      name: "Question without fields",
      query: {
        "source-table": `card__${card.id}`,
      },
    });
  });
}

function createMetricWithDependentMbqlQuestions() {
  H.getTableId({ databaseId: WRITABLE_DB_ID, name: "Animals" }).then(
    (tableId) => {
      H.getFieldId({ tableId, name: "score" }).then((fieldId) => {
        H.createQuestion({
          name: "Base metric",
          type: "metric",
          database: WRITABLE_DB_ID,
          query: {
            "source-table": tableId,
            aggregation: [["min", ["field", fieldId, null]]],
          },
        }).then(({ body: metric }) => {
          cy.wrap(metric.id).as("metricId");

          H.createQuestion({
            name: "Question with 1 stage",
            database: WRITABLE_DB_ID,
            query: {
              "source-table": tableId,
              aggregation: [["metric", metric.id]],
            },
          });

          H.createQuestion({
            name: "Question with 2 stages",
            database: WRITABLE_DB_ID,
            query: {
              "source-query": {
                "source-table": tableId,
                aggregation: [["metric", metric.id]],
                breakout: [["field", fieldId, null]],
              },
              aggregation: [
                ["avg", ["field", "min", { "base-type": "type/Integer" }]],
              ],
            },
          });

        });
      });
    },
  );
}

function confirmDiscardChanges() {
  H.modal().should("have.length", 2).last().button("Discard changes").click();
}
