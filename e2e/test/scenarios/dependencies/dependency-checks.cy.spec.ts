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
