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
    cy.intercept("PUT", "/api/ee/transform/*").as("updateTransform");
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

  describe("models", () => {
    it("should be able to confirm or cancel breaking changes to a SQL model", () => {
      createSqlModelWithDependentSqlQuestions();

      cy.log("make breaking changes");
      cy.get<number>("@modelId").then(H.visitModel);
      H.openQuestionActions("Edit query definition");
      H.NativeEditor.clear().type("SELECT ID, TITLE FROM PRODUCTS");
      H.runNativeQuery();

      cy.log("cancel breaking changes");
      H.datasetEditBar().button("Save changes").click();
      H.modal().within(() => {
        cy.findByText("Question with fields").should("be.visible");
        cy.findByText("Question without fields").should("not.exist");
        cy.findByText("Base model").should("not.exist");
        cy.button("Cancel").click();
      });
      cy.get("@updateCard.all").should("have.length", 0);

      cy.log("confirm breaking changes");
      H.datasetEditBar().button("Save changes").click();
      H.modal().button("Save anyway").click();
      cy.wait("@updateCard");
    });

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
    it("should be able to confirm or cancel breaking changes to a metric", () => {
      createMetricWithDependentMbqlQuestionsAndTransforms();

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
        cy.findByText("Transform with 2 stages").should("be.visible");
        cy.findByText("Question with 1 stage").should("not.exist");
        cy.findByText("Transform with 1 stage").should("not.exist");
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
      createMetricWithDependentMbqlQuestionsAndTransforms();
      cy.get<number>("@metricId").then(H.visitMetric);
      H.openQuestionActions("Edit metric definition");
      H.getNotebookStep("summarize").findByText("Min of Score").click();
      H.popover().findByText("Name").click();
      cy.findByTestId("edit-bar").button("Save changes").click();
      cy.wait("@updateCard");
    });
  });

  describe("transforms", () => {
    const goToEditorAndType = (queryString: string) => {
      H.DataStudio.Transforms.editDefinition().click();
      cy.url().should("include", "/edit");
      H.NativeEditor.clear().type(queryString);
    };

    it("should be able to confirm or cancel breaking changes to a SQL transform after it was run", () => {
      createSqlTransformWithDependentMbqlQuestions();

      cy.log("make breaking changes");
      cy.get<number>("@transformId").then(H.visitTransform);
      goToEditorAndType('SELECT name FROM "Schema A"."Animals"');

      cy.log("cancel breaking changes");
      H.DataStudio.Transforms.saveChangesButton().click();
      H.modal().within(() => {
        cy.findByText("Question with fields").should("be.visible");
        cy.findByText("Question without fields").should("not.exist");
        cy.findByText("Base transform").should("not.exist");
        cy.button("Cancel").click();
      });
      cy.get("@updateTransform.all").should("have.length", 0);

      goToEditorAndType('SELECT name FROM "Schema A"."Animals"');

      cy.log("confirm breaking changes");
      H.DataStudio.Transforms.saveChangesButton().click();
      H.modal().within(() => {
        cy.findByText("Question with fields").should("be.visible");
        cy.findByText("Question without fields").should("not.exist");
        cy.findByText("Base transform").should("not.exist");
        cy.button("Save anyway").click();
      });
      cy.wait("@updateTransform");
    });

    it("should not show a confirmation if there are no breaking changes when updating a SQL transform after it was run", () => {
      createSqlTransformWithDependentMbqlQuestions();
      cy.get<number>("@transformId").then(H.visitTransform);
      goToEditorAndType('SELECT score, name FROM "Schema A"."Animals"');
      H.DataStudio.Transforms.saveChangesButton().click();
      cy.wait("@updateTransform");
    });

    it("should be able to confirm or cancel breaking changes to a MBQL transform before it was run", () => {
      createMbqlTransformWithDependentSqlTransforms();

      cy.log("make breaking changes");
      cy.get<number>("@transformId").then(H.visitTransform);
      H.DataStudio.Transforms.editDefinition().click();
      H.getNotebookStep("data").findByLabelText("Pick columns").click();
      H.popover().findByLabelText("Score").click();

      cy.log("cancel breaking changes");
      H.DataStudio.Transforms.saveChangesButton().click();
      H.modal().within(() => {
        cy.findByText("Score transform").should("be.visible");
        cy.findByText("Name transform").should("not.exist");
        cy.findByText("Base transform").should("not.exist");
        cy.button("Cancel").click();
      });
      cy.get("@updateTransform.all").should("have.length", 0);

      H.DataStudio.Transforms.editDefinition().click();
      H.getNotebookStep("data").findByLabelText("Pick columns").click();
      H.popover().findByLabelText("Score").click();

      cy.log("confirm breaking changes");
      H.DataStudio.Transforms.saveChangesButton().click();
      H.modal().within(() => {
        cy.findByText("Score transform").should("be.visible");
        cy.findByText("Name transform").should("not.exist");
        cy.button("Save anyway").click();
      });
      cy.wait("@updateTransform");
    });

    it("should not show a confirmation if there are no breaking changes when updating a MBQL transform before it was run", () => {
      createMbqlTransformWithDependentSqlTransforms();
      cy.get<number>("@transformId").then(H.visitTransform);
      H.DataStudio.Transforms.editDefinition().click();
      H.getNotebookStep("data").button("Sort").click();
      H.popover().findByText("Score").click();
      H.DataStudio.Transforms.saveChangesButton().click();
      cy.wait("@updateTransform");
    });
  });

  describe("snippets", () => {
    it("should be able to confirm or cancel breaking changes to a snippet", () => {
      createSnippetWithDependentQuestionsAndTransforms();

      cy.log("make breaking changes");
      startEditingSnippet();
      H.modal()
        .findByLabelText("Enter some SQL here so you can reuse it later")
        .clear()
        .type("price = 1");

      cy.log("cancel breaking changes");
      H.modal().within(() => {
        cy.button("Save").click();
        cy.findByText("Question with snippet").should("be.visible");
        cy.findByText("Transform with snippet").should("be.visible");
        cy.findByText("ScoreSnippet").should("not.exist");
        cy.button("Cancel").click();
      });
      cy.get("@updateSnippet.all").should("have.length", 0);

      cy.log("confirm breaking changes");
      H.modal().within(() => {
        cy.button("Save").click();
        cy.findByText("Question with snippet").should("be.visible");
        cy.findByText("Transform with snippet").should("be.visible");
        cy.findByText("ScoreSnippet").should("not.exist");
        cy.button("Save anyway").click();
      });
      cy.wait("@updateSnippet");
    });

    it("should not warn if changes to a snippet are backward compatible", () => {
      createSnippetWithDependentQuestionsAndTransforms();
      startEditingSnippet();
      H.modal().within(() => {
        cy.findByLabelText("Enter some SQL here so you can reuse it later")
          .clear()
          .type("score = 2");
        cy.button("Save").click();
      });
      cy.wait("@updateSnippet");
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
    cy.request("POST", `/api/ee/transform/${transform.id}/run`);
    H.waitForSucceededTransformRuns();
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

function createMbqlTransformWithDependentSqlTransforms() {
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
            name: "base_transform",
            schema: "public",
            database: WRITABLE_DB_ID,
          },
        },
        { wrapId: true },
      );

      H.createTransform({
        name: "Name transform",
        source: {
          type: "query",
          query: {
            database: WRITABLE_DB_ID,
            type: "native",
            native: {
              query: "SELECT name FROM base_transform",
              "template-tags": {},
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

      H.createTransform({
        name: "Score transform",
        source: {
          type: "query",
          query: {
            database: WRITABLE_DB_ID,
            type: "native",
            native: {
              query: "SELECT score FROM base_transform",
              "template-tags": {},
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
    },
  );
}

function createSnippetWithDependentQuestionsAndTransforms() {
  H.createSnippet({
    name: "ScoreSnippet",
    content: "score = 1",
  }).then(({ body: snippet }) => {
    cy.wrap(snippet.id).as("snippetId");

    H.createNativeQuestion({
      name: "Question with snippet",
      database: WRITABLE_DB_ID,
      native: {
        query:
          'SELECT * FROM "Schema A"."Animals" WHERE {{snippet:ScoreSnippet}}',
        "template-tags": {
          "snippet:ScoreSnippet": {
            id: "4b77cc1f-ea70-4ef6-84db-58432fce6928",
            name: "snippet:ScoreSnippet",
            "display-name": "snippet:ScoreSnippet",
            type: "snippet",
            "snippet-id": snippet.id,
            "snippet-name": snippet.name,
          },
        },
      },
    });

    H.createTransform({
      name: "Transform with snippet",
      source: {
        type: "query",
        query: {
          database: WRITABLE_DB_ID,
          type: "native",
          native: {
            query:
              'SELECT * FROM "Schema A"."Animals" WHERE {{snippet:ScoreSnippet}}',
            "template-tags": {
              "snippet:ScoreSnippet": {
                id: "4b77cc1f-ea70-4ef6-84db-58432fce6929",
                name: "snippet:ScoreSnippet",
                "display-name": "snippet:ScoreSnippet",
                type: "snippet",
                "snippet-id": snippet.id,
                "snippet-name": snippet.name,
              },
            },
          },
        },
      },
      target: {
        type: "table",
        name: "transform_with_snippet",
        schema: "public",
        database: WRITABLE_DB_ID,
      },
    });
  });
}

function startEditingSnippet() {
  H.startNewNativeQuestion();
  cy.findByTestId("native-query-editor-action-buttons").icon("snippet").click();
  cy.findByTestId("sidebar-content").within(() => {
    cy.icon("chevrondown").click({ force: true });
    cy.button(/Edit/).click();
  });
}

function confirmDiscardChanges() {
  H.modal().should("have.length", 2).last().button("Discard changes").click();
}
