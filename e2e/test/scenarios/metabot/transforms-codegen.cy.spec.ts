import dedent from "ts-dedent";

import { WRITABLE_DB_ID } from "e2e/support/cypress_data";

const { H } = cy;

const SOURCE_TABLE = "Animals";

// Helper functions for metabot transform interactions
const visitTransformListPage = () => cy.visit("/data-studio/transforms");

const suggestions = () => cy.findAllByTestId("metabot-chat-suggestion");
// eslint-disable-next-line metabase/no-unsafe-element-filtering
const lastSuggestion = () => suggestions().last();

const viewLastSuggestion = () =>
  lastSuggestion()
    .findAllByRole("button", { name: /apply|create/i })
    .click();

const acceptSuggestionBtn = () =>
  cy.findByTestId("accept-proposed-changes-button");
const acceptSuggestion = () => acceptSuggestionBtn().click();

const rejectSuggestionBtn = () =>
  cy.findByTestId("reject-proposed-changes-button");
const rejectSuggestion = () => rejectSuggestionBtn().click();

type EditorType = "native" | "python";
const editor = (editorType: EditorType) =>
  editorType === "native" ? H.NativeEditor : H.PythonEditor;

const assertEditorContent = (editorType: EditorType, content: string) => {
  editor(editorType).get().should("contain", content);
};

const makeManualEdit = (editorType: EditorType, newContent: string) =>
  editor(editorType).clear().paste(newContent);

const getMetabotButton = () =>
  cy.findByRole("button", { name: /Chat with Metabot/ });

const assertSuggestionInSidebar = (values: {
  oldSourcePartial?: string;
  newSourcePartial: string;
}) => {
  lastSuggestion().should("contain", values.newSourcePartial);
  if (values.oldSourcePartial) {
    lastSuggestion().should("contain", values.oldSourcePartial);
  }
};

const assertEditorDiffState = (opts: { exists: boolean }) => {
  const should = opts.exists ? "exist" : "not.exist";
  H.DataStudio.Transforms.queryEditor()
    .findByRole("button", { name: /apply|create/i })
    .should(should);
  H.DataStudio.Transforms.queryEditor()
    .findByRole("button", { name: /reject/i })
    .should(should);
};

const sendCodgenBotMessage = (message: string) => {
  H.sendMetabotMessage(message);
  cy.wait("@metabotAgent").its("request.body").should("deep.include", {
    profile_id: "transforms_codegen",
  });
};

const assertAcceptRejectUI = (opts: { visible: boolean }) => {
  const should = opts.visible ? "be.visible" : "not.exist";
  acceptSuggestionBtn().should(should);
  rejectSuggestionBtn().should(should);
};

describe(
  "scenarios > metabot > transforms codegen",
  { viewportWidth: 1600, viewportHeight: 1200 },
  () => {
    beforeEach(() => {
      H.restore("postgres-writable");
      H.resetTestTable({ type: "postgres", table: "many_schemas" });
      H.resetSnowplow();
      cy.signInAsAdmin();
      H.activateToken("bleeding-edge");
      H.resyncDatabase({ dbId: WRITABLE_DB_ID, tableName: SOURCE_TABLE });

      cy.intercept("POST", "/api/ee/metabot-v3/agent-streaming").as("agentReq");
      cy.intercept("POST", "/api/transform").as("createTransform");
      cy.intercept("PUT", "/api/transform/*").as("updateTransform");
    });

    describe("Native SQL transform tests", () => {
      describe("create new transform", () => {
        it("should create SQL transform via metabot", () => {
          visitTransformListPage();
          getMetabotButton().click();

          cy.log("Ask metabot for a new transform");
          H.mockMetabotResponse({
            body: createMockTransformSuggestionResponse(
              "I'll create a new transform that gets the number 1 for you.",
              createMockNativeTransformJSON(null, WRITABLE_DB_ID, "SELECT 1"),
            ),
          });
          sendCodgenBotMessage(
            "Create a new native SQL transform that gives me the number 1",
          );
          assertSuggestionInSidebar({ newSourcePartial: "SELECT 1" });

          cy.log("Should be able to visit and the see new transform");
          viewLastSuggestion();
          cy.url().should("include", "/data-studio/transforms/new/native");
          assertEditorDiffState({ exists: false }); // nothing to diff, so we shouldn't show the UI for it
          assertEditorContent("native", "SELECT 1");

          // User should ask metabot for a change
          cy.log("Ask metabot for an edit");
          H.mockMetabotResponse({
            body: createMockTransformSuggestionResponse(
              "Let me make that update for you.",
              createMockNativeTransformJSON(null, WRITABLE_DB_ID, "SELECT 2"),
            ),
          });
          sendCodgenBotMessage("Make this give me the number 2 instead");
          assertSuggestionInSidebar({
            oldSourcePartial: "SELECT 1",
            newSourcePartial: "SELECT 2",
          });
          assertAcceptRejectUI({ visible: true });

          // User can accept a change (editor should have new value)
          cy.log("Should be able to select an edit");
          acceptSuggestion();
          assertEditorContent("native", "SELECT 2");
          assertAcceptRejectUI({ visible: false });

          // User should make changes to the source
          cy.log("Should diff with user edits");
          makeManualEdit("native", "SELECT 3");
          H.mockMetabotResponse({
            body: createMockTransformSuggestionResponse(
              "Let me make that change for you.",
              createMockNativeTransformJSON(null, WRITABLE_DB_ID, "SELECT 4"),
            ),
          });
          sendCodgenBotMessage("Make this give me the number 4 instead");
          assertSuggestionInSidebar({
            oldSourcePartial: "SELECT 3",
            newSourcePartial: "SELECT 4",
          });
          assertAcceptRejectUI({ visible: true });

          cy.log("Should be able to reject an edit");
          rejectSuggestion();
          assertEditorContent("native", "SELECT 3");
          assertAcceptRejectUI({ visible: false });
        });

        it("should create Python transform via metabot", () => {
          visitTransformListPage();
          getMetabotButton().click();

          cy.log("Ask metabot for a new transform");
          H.mockMetabotResponse({
            body: createMockTransformSuggestionResponse(
              "I'll create a new transform that gets the number 1 for you.",
              createMockPythonTransformJSON(
                null,
                WRITABLE_DB_ID,
                { metabase_table_df: 152 },
                "import pandas as pd\\n\\ndef transform(metabase_table_df):\\n    return pd.DataFrame({'value': [1]})",
              ),
            ),
          });
          sendCodgenBotMessage(
            "Create a new native python transform that gives me the number 1",
          );
          assertSuggestionInSidebar({
            newSourcePartial: "pd.DataFrame({'value': [1]})",
          });

          cy.log("Should be able to visit and the see new transform");
          viewLastSuggestion();
          cy.url().should("include", "/data-studio/transforms/new/python");
          assertEditorDiffState({ exists: false }); // nothing to diff, so we shouldn't show the UI for it
          assertEditorContent("python", "pd.DataFrame({'value': [1]})");

          // User should ask metabot for a change
          cy.log("Ask metabot for an edit");
          H.mockMetabotResponse({
            body: createMockTransformSuggestionResponse(
              "Let me make that update for you.",
              createMockPythonTransformJSON(
                null,
                WRITABLE_DB_ID,
                { metabase_table_df: 152 },
                "import pandas as pd\\n\\ndef transform(metabase_table_df):\\n    return pd.DataFrame({'value': [2]})",
              ),
            ),
          });
          sendCodgenBotMessage("Make this give me the number 2 instead");
          assertSuggestionInSidebar({
            oldSourcePartial: "pd.DataFrame({'value': [1]})",
            newSourcePartial: "pd.DataFrame({'value': [2]})",
          });
          assertAcceptRejectUI({ visible: true });

          // User can accept a change (editor should have new value)
          cy.log("Should be able to select an edit");
          acceptSuggestion();
          assertEditorContent("python", "pd.DataFrame({'value': [2]})");
          assertAcceptRejectUI({ visible: false });

          // User should make changes to the source
          cy.log("Should diff with user edits");
          makeManualEdit(
            "python",
            dedent`
            import pandas as pd

            def transform(metabase_table_df):
                return pd.DataFrame({'value': [3]})`,
          );
          H.mockMetabotResponse({
            body: createMockTransformSuggestionResponse(
              "Let me make that change for you.",
              createMockPythonTransformJSON(
                null,
                WRITABLE_DB_ID,
                { metabase_table_df: 152 },
                "import pandas as pd\\n\\ndef transform(metabase_table_df):\\n    return pd.DataFrame({'value': [4]})",
              ),
            ),
          });
          sendCodgenBotMessage("Make this give me the number 4 instead");
          assertSuggestionInSidebar({
            oldSourcePartial: "pd.DataFrame({'value': [3]})",
            newSourcePartial: "pd.DataFrame({'value': [4]})",
          });
          assertAcceptRejectUI({ visible: true });

          cy.log("Should be able to reject an edit");
          rejectSuggestion();
          assertEditorContent("python", "pd.DataFrame({'value': [3]})");
          assertAcceptRejectUI({ visible: false });
        });

        it("should create SQL transform with model reference via metabot and run successfully", () => {
          // Create a model first
          H.getTableId({ name: SOURCE_TABLE, databaseId: WRITABLE_DB_ID }).as(
            "tableId",
          );

          cy.get("@tableId").then((tableId) => {
            H.createQuestion({
              name: "Test Model",
              type: "model",
              query: {
                "source-table": tableId,
                limit: 5,
              },
            }).as("model");
          });

          cy.get("@model").then(({ body: model }) => {
            visitTransformListPage();
            getMetabotButton().click();

            cy.log("Ask metabot for a new transform that references the model");
            const modelTagName = `#${model.id}-test-model`;
            const queryWithModelRef = `SELECT * FROM {{${modelTagName}}}`;

            H.mockMetabotResponse({
              body: createMockTransformSuggestionResponse(
                "I'll create a transform that queries your model.",
                createMockNativeTransformJSON(
                  null,
                  WRITABLE_DB_ID,
                  queryWithModelRef,
                ),
              ),
            });
            sendCodgenBotMessage(
              "Create a transform that queries the Test Model",
            );
            assertSuggestionInSidebar({ newSourcePartial: "SELECT * FROM" });

            cy.log("Should be able to visit the new transform");
            viewLastSuggestion();
            cy.url().should("include", "/data-studio/transforms/new/native");
            assertEditorContent("native", "SELECT * FROM");

            cy.log(
              "Should be able to run the transform successfully (verifies template tags were parsed)",
            );
            cy.findByTestId("native-query-editor-container")
              .icon("play")
              .click();
            cy.findByTestId("query-visualization-root").should("be.visible");
          });
        });
      });

      describe("update existing transform", () => {
        it("should update existing SQL transform via metabot", () => {
          H.createSqlTransform({
            sourceQuery: "SELECT 1",
            targetTable: "table_a",
            targetSchema: "Schema A",
          }).as("transformId");

          visitTransformListPage();
          getMetabotButton().click();

          // Ask metabot for a change to existing transform
          cy.get("@transformId").then((transformId) => {
            H.mockMetabotResponse({
              body: createMockTransformSuggestionResponse(
                "Let me make that update for you.",
                createMockNativeTransformJSON(
                  Number(transformId),
                  WRITABLE_DB_ID,
                  "SELECT 2",
                ),
              ),
            });
          });
          sendCodgenBotMessage(
            "Update my SQL transform to select 2 instead of 1.",
          );
          assertSuggestionInSidebar({
            oldSourcePartial: "SELECT 1",
            newSourcePartial: "SELECT 2",
          });

          cy.log("Should be able to visit and the see the updated transform");
          viewLastSuggestion();
          assertAcceptRejectUI({ visible: true });

          // User can accept a change (editor should have new value)
          cy.log("Should be able to select an edit");
          acceptSuggestion();
          assertEditorContent("native", "SELECT 2");
          assertAcceptRejectUI({ visible: false });

          // User should make changes to the source
          cy.log("Should diff with user edits");
          makeManualEdit("native", "SELECT 3");
          cy.get("@transformId").then((transformId) => {
            H.mockMetabotResponse({
              body: createMockTransformSuggestionResponse(
                "Let me make that change for you.",
                createMockNativeTransformJSON(
                  Number(transformId),
                  WRITABLE_DB_ID,
                  "SELECT 4",
                ),
              ),
            });
          });
          sendCodgenBotMessage("Make this give me the number 4 instead");
          assertSuggestionInSidebar({
            oldSourcePartial: "SELECT 3",
            newSourcePartial: "SELECT 4",
          });
          assertAcceptRejectUI({ visible: true });

          cy.log("Should be able to reject an edit");
          rejectSuggestion();
          assertEditorContent("native", "SELECT 3");
          assertAcceptRejectUI({ visible: false });
        });

        it("should update existing Python transform via metabot", () => {
          H.getTableId({ name: SOURCE_TABLE, databaseId: WRITABLE_DB_ID }).then(
            (tableId) => {
              H.createPythonTransform({
                targetTable: "transform_table",
                targetSchema: "Schema A",
                body: dedent`
                import pandas as pd

                def transform(foo):
                  return pd.DataFrame({'value': [1]})
              `,
                sourceTables: { foo: tableId },
              }).then((transformId) => {
                visitTransformListPage();
                getMetabotButton().click();

                // Ask metabot for a change to existing transform
                cy.get("@transformId").then((transformId) => {
                  H.mockMetabotResponse({
                    body: createMockTransformSuggestionResponse(
                      "Let me make that update for you.",
                      createMockPythonTransformJSON(
                        Number(transformId),
                        WRITABLE_DB_ID,
                        { foo: tableId },
                        "import pandas as pd\\n\\ndef transform(foo):\\n    return pd.DataFrame({'value': [2]})",
                      ),
                    ),
                  });
                });
                sendCodgenBotMessage(
                  "Update my SQL transform to select 2 instead of 1.",
                );
                assertSuggestionInSidebar({
                  oldSourcePartial: "pd.DataFrame({'value': [1]})",
                  newSourcePartial: "pd.DataFrame({'value': [2]})",
                });

                cy.log(
                  "Should be able to visit and the see the updated transform",
                );
                viewLastSuggestion();
                assertAcceptRejectUI({ visible: true });

                // User can accept a change (editor should have new value)
                cy.log("Should be able to select an edit");
                acceptSuggestion();
                assertEditorContent("python", "pd.DataFrame({'value': [2]})");
                assertAcceptRejectUI({ visible: false });

                // User should make changes to the source
                cy.log("Should diff with user edits");
                makeManualEdit(
                  "python",
                  dedent`
                  import pandas as pd

                  def transform(foo):
                      return pd.DataFrame({'value': [3]})`,
                );

                H.mockMetabotResponse({
                  body: createMockTransformSuggestionResponse(
                    "Let me make that change for you.",
                    createMockPythonTransformJSON(
                      Number(transformId),
                      WRITABLE_DB_ID,
                      { metabase_table_df: 152 },
                      "import pandas as pd\\n\\ndef transform(foo):\\n    return pd.DataFrame({'value': [4]})",
                    ),
                  ),
                });
                sendCodgenBotMessage("Make this give me the number 4 instead");
                assertSuggestionInSidebar({
                  oldSourcePartial: "pd.DataFrame({'value': [3]})",
                  newSourcePartial: "pd.DataFrame({'value': [4]})",
                });
                assertAcceptRejectUI({ visible: true });

                cy.log("Should be able to reject an edit");
                rejectSuggestion();
                assertEditorContent("python", "pd.DataFrame({'value': [3]})");
                assertAcceptRejectUI({ visible: false });
              });
            },
          );
        });
      });
    });
  },
);

const createMockNativeTransformJSON = (
  id: number | null,
  databaseId: number,
  sql: string,
) =>
  `{"id":${id},"name":"A number","entity_id":null,"description":"","source":{"type":"query","query":{"database":${databaseId},"type":"native","native":{"query":"${sql}","template-tags":{}}}},"target":{"type":"table","name":""},"created_at":null,"updated_at":null}`;

const createMockPythonTransformJSON = (
  id: number | null,
  databaseId: number,
  sourceTables: { [tableName: string]: number },
  body: string,
) =>
  `{"id":${id},"name":"A number","entity_id":null,"description":"","source":{"type":"python","source-database":${databaseId},"source-tables":${JSON.stringify(sourceTables)},"body":"${body}"},"target":{"type":"table","name":""},"created_at":null,"updated_at":null}`;

const createMockTransformSuggestionResponse = (
  text: string,
  transformJSON: string,
) => {
  return `0:"${text}"
2:{"type":"transform_suggestion","version":1,"value":${transformJSON}}
2:{"type":"state","version":1,"value":{}}
d:{"finishReason":"stop","usage":{}}`;
};
