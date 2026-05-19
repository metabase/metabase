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
    H.activateToken("pro-self-hosted");
    H.updateSetting("transforms-enabled", true);
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: "Animals" });
    H.resetSnowplow();

    cy.intercept("PUT", "/api/card/*").as("updateCard");
    cy.intercept("PUT", "/api/native-query-snippet/*").as("updateSnippet");
    cy.intercept("PUT", "/api/transform/*").as("updateTransform");
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
      createMetricWithDependentMbqlQuestionsAndTransforms();
      cy.get<number>("@metricId").then((metricId) => {
        cy.visit(`/metric/${metricId}/query`);
      });
      H.getNotebookStep("summarize").findByText("Min of Score").click();
      H.popover().findByText("Name").click();
      cy.button("Save").click();
      cy.wait("@updateCard");
    });
  });

  describe("transforms", () => {
    const goToEditorAndType = (queryString: string) => {
      H.DataStudio.Transforms.clickEditDefinition();
      cy.url().should("include", "/edit");
      H.NativeEditor.clear().type(queryString);
    };

    it("should not show a confirmation if there are no breaking changes when updating a SQL transform after it was run", () => {
      createSqlTransformWithDependentMbqlQuestions();
      cy.get<number>("@transformId").then(H.visitTransform);
      goToEditorAndType('SELECT score, name FROM "Schema A"."Animals"');
      H.DataStudio.Transforms.saveChangesButton().click();
      cy.wait("@updateTransform");
    });

    it("should not show a confirmation if there are no breaking changes when updating a MBQL transform before it was run", () => {
      createMbqlTransformWithDependentMbqlTransforms();
      cy.get<number>("@transformId").then(H.visitTransform);
      H.DataStudio.Transforms.clickEditDefinition();
      H.getNotebookStep("data").button("Sort").click();
      H.popover().findByText("Score").click();
      H.DataStudio.Transforms.saveChangesButton().click();
      cy.wait("@updateTransform");
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

function createMetricWithDependentMbqlQuestionsAndTransforms() {
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

          H.createTransform({
            name: "Transform with 1 stage",
            source: {
              type: "query",
              query: {
                database: WRITABLE_DB_ID,
                type: "query",
                query: {
                  "source-table": tableId,
                  aggregation: [["metric", metric.id]],
                },
              },
            },
            target: {
              type: "table",
              name: "transform_1_stage",
              schema: "public",
              database: WRITABLE_DB_ID,
            },
          });

          H.createTransform({
            name: "Transform with 2 stages",
            source: {
              type: "query",
              query: {
                database: WRITABLE_DB_ID,
                type: "query",
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
              },
            },
            target: {
              type: "table",
              name: "transform_2_stages",
              schema: "public",
              database: WRITABLE_DB_ID,
            },
          });
        });
      });
    },
  );
}

function createSqlTransformWithDependentMbqlQuestions() {
  const transformTableName = "base_transform";

  H.createTransform({
    name: "Base transform",
    source: {
      type: "query",
      query: {
        database: WRITABLE_DB_ID,
        type: "native",
        native: {
          query: 'SELECT name, score FROM "Schema A"."Animals"',
          "template-tags": {},
        },
      },
    },
    target: {
      type: "table",
      name: transformTableName,
      schema: "public",
      database: WRITABLE_DB_ID,
    },
  }).then(({ body: transform }) => {
    cy.wrap(transform.id).as("transformId");
    H.runTransformAndWaitForSuccess(transform.id);
    H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: transformTableName });

    H.getTableId({ databaseId: WRITABLE_DB_ID, name: transformTableName }).then(
      (tableId) => {
        H.createQuestion({
          name: "Question with fields",
          database: WRITABLE_DB_ID,
          query: {
            "source-table": tableId,
            filter: [
              ">",
              ["field", "score", { "base-type": "type/Integer" }],
              1,
            ],
          },
        });
        H.createQuestion({
          name: "Question without fields",
          database: WRITABLE_DB_ID,
          query: {
            "source-table": tableId,
          },
        });
      },
    );
  });
}

function createMbqlTransformWithDependentMbqlTransforms() {
  const targetTableName = "base_transform";

  H.getTableId({ name: "Animals", databaseId: WRITABLE_DB_ID }).then(
    (tableId) => {
      H.createTransform(
        {
          name: "Base transform",
          source: {
            type: "query",
            query: {
              database: WRITABLE_DB_ID,
              type: "query",
              query: {
                "source-table": tableId,
              },
            },
          },
          target: {
            type: "table",
            name: targetTableName,
            schema: "public",
            database: WRITABLE_DB_ID,
          },
        },
        { wrapId: true },
      )
        .then(({ body }) => H.runTransformAndWaitForSuccess(body.id))
        .then(() => {
          H.resyncDatabase({
            dbId: WRITABLE_DB_ID,
            tableName: targetTableName,
          });
          H.getTableId({
            databaseId: WRITABLE_DB_ID,
            name: targetTableName,
          }).then((tableId) => {
            H.getFieldId({ tableId, name: "name" }).then((fieldId) => {
              H.createTransform({
                name: "Name transform",
                source: {
                  type: "query",
                  query: {
                    database: WRITABLE_DB_ID,
                    type: "query",
                    query: {
                      "source-table": tableId,
                      fields: [["field", fieldId, null]],
                    },
                  },
                },
                target: {
                  type: "table",
                  name: "name_transform",
                  schema: "public",
                  database: WRITABLE_DB_ID,
                },
              });
            });

            H.getFieldId({ tableId, name: "score" }).then((fieldId) => {
              H.createTransform({
                name: "Score transform",
                source: {
                  type: "query",
                  query: {
                    database: WRITABLE_DB_ID,
                    type: "query",
                    query: {
                      "source-table": tableId,
                      filter: [">", ["field", fieldId, null], 1],
                    },
                  },
                },
                target: {
                  type: "table",
                  name: "score_transform",
                  schema: "public",
                  database: WRITABLE_DB_ID,
                },
              });
            });
          });
        });
    },
  );
}
