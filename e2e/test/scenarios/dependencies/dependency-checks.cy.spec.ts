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

  describe("models", () => {
    it("should not show a confirmation if there are no breaking changes when updating a SQL model", () => {
      createSqlModelWithDependentSqlQuestions();
      cy.get<number>("@modelId").then(H.visitModel);
      H.openQuestionActions("Edit query definition");
      H.NativeEditor.clear().type("SELECT ID, CATEGORY FROM PRODUCTS");
      H.runNativeQuery();
      H.datasetEditBar().button("Save changes").click();
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

function createSqlModelWithDependentSqlQuestions() {
  H.createNativeQuestion({
    name: "Base model",
    type: "model",
    native: {
      query: "SELECT ID, TITLE, CATEGORY FROM PRODUCTS",
      "template-tags": {},
    },
  }).then(({ body: card }) => {
    cy.wrap(card.id).as("modelId");
    cy.request("POST", `/api/card/${card.id}/query`);

    const tagName = `#${card.id}`;
    H.createNativeQuestion({
      name: "Question with fields",
      native: {
        query: `SELECT ID, CATEGORY FROM {{#${card.id}}}`,
        "template-tags": {
          [tagName]: {
            id: "10422a0f-292d-10a3-fd90-407cc9e3e20e",
            name: tagName,
            "display-name": tagName,
            type: "card",
            "card-id": card.id,
          },
        },
      },
    });

    H.createNativeQuestion({
      name: "Question without fields",
      native: {
        query: `SELECT COUNT(*) FROM {{#${card.id}}}`,
        "template-tags": {
          [tagName]: {
            id: "10422a0f-292d-10a3-fd90-407cc9e3e20f",
            name: tagName,
            "display-name": tagName,
            type: "card",
            "card-id": card.id,
          },
        },
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
