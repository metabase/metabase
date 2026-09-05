/**
 * Playwright port of
 * e2e/test/scenarios/metabot/transforms-codegen.cy.spec.ts
 *
 * Metabot generates transform code: the (stubbed) agent streams back a
 * `transform_suggestion` data part carrying a full transform JSON, the chat
 * sidebar shows the proposed source, and the transform query editor shows a
 * diff with accept/reject buttons. Accept applies the new source; reject
 * restores the user's edit.
 *
 * The LLM is STUBBED, never real: POST /api/metabot/agent-streaming is mocked
 * with a canned SSE body (support/metabot.ts builders, imported read-only).
 * `llm-anthropic-api-key` is set only so the model reads as "configured"; no
 * real key or LLM call is involved.
 *
 * Infra-gated (PORTING infra-gate rule): the whole upstream spec restores the
 * `postgres-writable` snapshot, resets the `many_schemas` test table, and drives
 * WRITABLE_DB_ID (the writable QA postgres). None of that is in the jar's
 * snapshots nor provisioned in this spike, so the spec is gated on
 * PW_QA_DB_ENABLED and SKIPS on the jar. It is faithful-by-construction; a green
 * run here means "correctly skipped", not "passing". Also token-gated (EE).
 *
 * Port notes:
 * - The three beforeEach intercepts (`@agentReq` POST /api/metabot/agent-streaming,
 *   `@createTransform` POST /api/transform, `@updateTransform` PUT
 *   /api/transform/*) are DROPPED — none is ever awaited. sendCodgenBotMessage
 *   registers its own waitForResponse on agent-streaming (PORTING rule 2).
 * - H.resetSnowplow() → real reset of this slot's collector (../support/snowplow).
 * - cy.url().should("include", …) → expect.poll (Cypress retried the URL).
 * - Metabot chat sidebar / suggestion / editor helpers live in
 *   support/transforms-codegen.ts (new file — PORTING rule 9). Native-editor
 *   helpers are imported read-only.
 */
import { test, expect } from "../support/fixtures";
import { resolveToken } from "../support/api";
import { mockMetabotResponse } from "../support/metabot";
import { resetSnowplow } from "../support/snowplow";
import { WRITABLE_DB_ID, getTableId, resyncDatabase } from "../support/schema-viewer";
import {
  SOURCE_TABLE,
  assertAcceptRejectUI,
  assertEditorContent,
  assertEditorDiffState,
  assertSuggestionInSidebar,
  acceptSuggestion,
  createMockNativeTransformJSON,
  createMockPythonTransformJSON,
  createMockTransformSuggestionResponse,
  createPythonTransform,
  createSqlTransform,
  getMetabotButton,
  makeManualEdit,
  pythonSourceTables,
  rejectSuggestion,
  resetManySchemasTable,
  sendCodgenBotMessage,
  viewLastSuggestion,
  visitTransformListPage,
} from "../support/transforms-codegen";
import { icon } from "../support/ui";

test.use({ viewport: { width: 1600, height: 1200 } });

test.describe("scenarios > metabot > transforms codegen", () => {
  test.skip(
    !process.env.PW_QA_DB_ENABLED,
    "Requires the writable QA postgres database and its postgres-writable snapshot (set PW_QA_DB_ENABLED)",
  );
  test.skip(
    !resolveToken("pro-self-hosted"),
    "requires the pro-self-hosted token (MB_PRO_SELF_HOSTED / CYPRESS_...)",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore("postgres-writable");
    await resetManySchemasTable();
    await resetSnowplow(mb);
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
    await mb.api.updateSetting("transforms-enabled", true);
    await mb.api.updateSetting("llm-anthropic-api-key", "sk-ant-test-key");
    await resyncDatabase(mb.api, {
      dbId: WRITABLE_DB_ID,
      tables: [SOURCE_TABLE],
    });
    // The @agentReq / @createTransform / @updateTransform intercepts are never
    // awaited upstream — dropped (PORTING rule 2).
  });

  test.describe("Native SQL transform tests", () => {
    test.describe("create new transform", () => {
      test("should create SQL transform via metabot", async ({ page }) => {
        await visitTransformListPage(page);
        await getMetabotButton(page).click();

        // Ask metabot for a new transform
        await mockMetabotResponse(page, {
          body: createMockTransformSuggestionResponse(
            "I'll create a new transform that gets the number 1 for you.",
            createMockNativeTransformJSON(null, WRITABLE_DB_ID, "SELECT 1"),
          ),
        });
        await sendCodgenBotMessage(
          page,
          "Create a new native SQL transform that gives me the number 1",
        );
        await assertSuggestionInSidebar(page, { newSourcePartial: "SELECT 1" });

        // Should be able to visit and see the new transform
        await viewLastSuggestion(page);
        await expect
          .poll(() => page.url())
          .toContain("/data-studio/transforms/new/native");
        await assertEditorDiffState(page, { exists: false }); // nothing to diff
        await assertEditorContent(page, "native", "SELECT 1");

        // Ask metabot for an edit
        await mockMetabotResponse(page, {
          body: createMockTransformSuggestionResponse(
            "Let me make that update for you.",
            createMockNativeTransformJSON(null, WRITABLE_DB_ID, "SELECT 2"),
          ),
        });
        await sendCodgenBotMessage(page, "Make this give me the number 2 instead");
        await assertSuggestionInSidebar(page, {
          oldSourcePartial: "SELECT 1",
          newSourcePartial: "SELECT 2",
        });
        await assertAcceptRejectUI(page, { visible: true });

        // User can accept a change (editor should have new value)
        await acceptSuggestion(page);
        await assertEditorContent(page, "native", "SELECT 2");
        await assertAcceptRejectUI(page, { visible: false });

        // User makes changes to the source, then diffs against a new suggestion
        await makeManualEdit(page, "native", "SELECT 3");
        await mockMetabotResponse(page, {
          body: createMockTransformSuggestionResponse(
            "Let me make that change for you.",
            createMockNativeTransformJSON(null, WRITABLE_DB_ID, "SELECT 4"),
          ),
        });
        await sendCodgenBotMessage(page, "Make this give me the number 4 instead");
        await assertSuggestionInSidebar(page, {
          oldSourcePartial: "SELECT 3",
          newSourcePartial: "SELECT 4",
        });
        await assertAcceptRejectUI(page, { visible: true });

        // User can reject an edit
        await rejectSuggestion(page);
        await assertEditorContent(page, "native", "SELECT 3");
        await assertAcceptRejectUI(page, { visible: false });
      });

      test("should create Python transform via metabot", async ({ page }) => {
        await visitTransformListPage(page);
        await getMetabotButton(page).click();

        // Ask metabot for a new transform
        await mockMetabotResponse(page, {
          body: createMockTransformSuggestionResponse(
            "I'll create a new transform that gets the number 1 for you.",
            createMockPythonTransformJSON(
              null,
              WRITABLE_DB_ID,
              pythonSourceTables("metabase_table_df", 152),
              "import pandas as pd\\n\\ndef transform(metabase_table_df):\\n    return pd.DataFrame({'value': [1]})",
            ),
          ),
        });
        await sendCodgenBotMessage(
          page,
          "Create a new native python transform that gives me the number 1",
        );
        await assertSuggestionInSidebar(page, {
          newSourcePartial: "pd.DataFrame({'value': [1]})",
        });

        // Should be able to visit and see the new transform
        await viewLastSuggestion(page);
        await expect
          .poll(() => page.url())
          .toContain("/data-studio/transforms/new/python");
        await assertEditorDiffState(page, { exists: false }); // nothing to diff
        await assertEditorContent(page, "python", "pd.DataFrame({'value': [1]})");

        // Ask metabot for an edit
        await mockMetabotResponse(page, {
          body: createMockTransformSuggestionResponse(
            "Let me make that update for you.",
            createMockPythonTransformJSON(
              null,
              WRITABLE_DB_ID,
              pythonSourceTables("metabase_table_df", 152),
              "import pandas as pd\\n\\ndef transform(metabase_table_df):\\n    return pd.DataFrame({'value': [2]})",
            ),
          ),
        });
        await sendCodgenBotMessage(page, "Make this give me the number 2 instead");
        await assertSuggestionInSidebar(page, {
          oldSourcePartial: "pd.DataFrame({'value': [1]})",
          newSourcePartial: "pd.DataFrame({'value': [2]})",
        });
        await assertAcceptRejectUI(page, { visible: true });

        // User can accept a change (editor should have new value)
        await acceptSuggestion(page);
        await assertEditorContent(page, "python", "pd.DataFrame({'value': [2]})");
        await assertAcceptRejectUI(page, { visible: false });

        // User makes changes to the source, then diffs against a new suggestion
        await makeManualEdit(
          page,
          "python",
          [
            "import pandas as pd",
            "",
            "def transform(metabase_table_df):",
            "    return pd.DataFrame({'value': [3]})",
          ].join("\n"),
        );
        await mockMetabotResponse(page, {
          body: createMockTransformSuggestionResponse(
            "Let me make that change for you.",
            createMockPythonTransformJSON(
              null,
              WRITABLE_DB_ID,
              pythonSourceTables("metabase_table_df", 152),
              "import pandas as pd\\n\\ndef transform(metabase_table_df):\\n    return pd.DataFrame({'value': [4]})",
            ),
          ),
        });
        await sendCodgenBotMessage(page, "Make this give me the number 4 instead");
        await assertSuggestionInSidebar(page, {
          oldSourcePartial: "pd.DataFrame({'value': [3]})",
          newSourcePartial: "pd.DataFrame({'value': [4]})",
        });
        await assertAcceptRejectUI(page, { visible: true });

        // User can reject an edit
        await rejectSuggestion(page);
        await assertEditorContent(page, "python", "pd.DataFrame({'value': [3]})");
        await assertAcceptRejectUI(page, { visible: false });
      });

      test("should create SQL transform with model reference via metabot and run successfully", async ({
        page,
        mb,
      }) => {
        // Create a model first
        const tableId = await getTableId(mb.api, {
          name: SOURCE_TABLE,
          databaseId: WRITABLE_DB_ID,
        });
        const model = await mb.api.createQuestion({
          name: "Test Model",
          type: "model",
          query: {
            "source-table": tableId,
            limit: 5,
          },
        });

        await visitTransformListPage(page);
        await getMetabotButton(page).click();

        // Ask metabot for a new transform that references the model
        const modelTagName = `#${model.id}-test-model`;
        const queryWithModelRef = `SELECT * FROM {{${modelTagName}}}`;

        await mockMetabotResponse(page, {
          body: createMockTransformSuggestionResponse(
            "I'll create a transform that queries your model.",
            createMockNativeTransformJSON(null, WRITABLE_DB_ID, queryWithModelRef),
          ),
        });
        await sendCodgenBotMessage(page, "Create a transform that queries the Test Model");
        await assertSuggestionInSidebar(page, { newSourcePartial: "SELECT * FROM" });

        // Should be able to visit the new transform
        await viewLastSuggestion(page);
        await expect
          .poll(() => page.url())
          .toContain("/data-studio/transforms/new/native");
        await assertEditorContent(page, "native", "SELECT * FROM");

        // Should be able to run the transform successfully (verifies template
        // tags were parsed)
        await icon(page.getByTestId("native-query-editor-container"), "play").click();
        await expect(page.getByTestId("query-visualization-root")).toBeVisible();
      });
    });

    test.describe("update existing transform", () => {
      test("should update existing SQL transform via metabot", async ({
        page,
        mb,
      }) => {
        const transform = await createSqlTransform(mb.api, {
          sourceQuery: "SELECT 1",
          targetTable: "table_a",
          targetSchema: "Schema A",
        });

        await visitTransformListPage(page);
        await getMetabotButton(page).click();

        // Ask metabot for a change to the existing transform
        await mockMetabotResponse(page, {
          body: createMockTransformSuggestionResponse(
            "Let me make that update for you.",
            createMockNativeTransformJSON(
              Number(transform.id),
              WRITABLE_DB_ID,
              "SELECT 2",
            ),
          ),
        });
        await sendCodgenBotMessage(
          page,
          "Update my SQL transform to select 2 instead of 1.",
        );
        await assertSuggestionInSidebar(page, {
          oldSourcePartial: "SELECT 1",
          newSourcePartial: "SELECT 2",
        });

        // Should be able to visit and see the updated transform
        await viewLastSuggestion(page);
        await assertAcceptRejectUI(page, { visible: true });

        // User can accept a change (editor should have new value)
        await acceptSuggestion(page);
        await assertEditorContent(page, "native", "SELECT 2");
        await assertAcceptRejectUI(page, { visible: false });

        // User makes changes to the source, then diffs against a new suggestion
        await makeManualEdit(page, "native", "SELECT 3");
        await mockMetabotResponse(page, {
          body: createMockTransformSuggestionResponse(
            "Let me make that change for you.",
            createMockNativeTransformJSON(
              Number(transform.id),
              WRITABLE_DB_ID,
              "SELECT 4",
            ),
          ),
        });
        await sendCodgenBotMessage(page, "Make this give me the number 4 instead");
        await assertSuggestionInSidebar(page, {
          oldSourcePartial: "SELECT 3",
          newSourcePartial: "SELECT 4",
        });
        await assertAcceptRejectUI(page, { visible: true });

        // User can reject an edit
        await rejectSuggestion(page);
        await assertEditorContent(page, "native", "SELECT 3");
        await assertAcceptRejectUI(page, { visible: false });
      });

      test("should update existing Python transform via metabot", async ({
        page,
        mb,
      }) => {
        const tableId = await getTableId(mb.api, {
          name: SOURCE_TABLE,
          databaseId: WRITABLE_DB_ID,
        });
        const transform = await createPythonTransform(mb.api, {
          targetTable: "transform_table",
          targetSchema: "Schema A",
          body: [
            "import pandas as pd",
            "",
            "def transform(foo):",
            "  return pd.DataFrame({'value': [1]})",
          ].join("\n"),
          sourceTables: pythonSourceTables("foo", Number(tableId)),
        });

        await visitTransformListPage(page);
        await getMetabotButton(page).click();

        // Ask metabot for a change to the existing transform
        await mockMetabotResponse(page, {
          body: createMockTransformSuggestionResponse(
            "Let me make that update for you.",
            createMockPythonTransformJSON(
              Number(transform.id),
              WRITABLE_DB_ID,
              pythonSourceTables("foo", Number(tableId)),
              "import pandas as pd\\n\\ndef transform(foo):\\n    return pd.DataFrame({'value': [2]})",
            ),
          ),
        });
        await sendCodgenBotMessage(
          page,
          "Update my SQL transform to select 2 instead of 1.",
        );
        await assertSuggestionInSidebar(page, {
          oldSourcePartial: "pd.DataFrame({'value': [1]})",
          newSourcePartial: "pd.DataFrame({'value': [2]})",
        });

        // Should be able to visit and see the updated transform
        await viewLastSuggestion(page);
        await assertAcceptRejectUI(page, { visible: true });

        // User can accept a change (editor should have new value)
        await acceptSuggestion(page);
        await assertEditorContent(page, "python", "pd.DataFrame({'value': [2]})");
        await assertAcceptRejectUI(page, { visible: false });

        // User makes changes to the source, then diffs against a new suggestion
        await makeManualEdit(
          page,
          "python",
          [
            "import pandas as pd",
            "",
            "def transform(foo):",
            "    return pd.DataFrame({'value': [3]})",
          ].join("\n"),
        );
        await mockMetabotResponse(page, {
          body: createMockTransformSuggestionResponse(
            "Let me make that change for you.",
            createMockPythonTransformJSON(
              Number(transform.id),
              WRITABLE_DB_ID,
              pythonSourceTables("metabase_table_df", 152),
              "import pandas as pd\\n\\ndef transform(foo):\\n    return pd.DataFrame({'value': [4]})",
            ),
          ),
        });
        await sendCodgenBotMessage(page, "Make this give me the number 4 instead");
        await assertSuggestionInSidebar(page, {
          oldSourcePartial: "pd.DataFrame({'value': [3]})",
          newSourcePartial: "pd.DataFrame({'value': [4]})",
        });
        await assertAcceptRejectUI(page, { visible: true });

        // User can reject an edit
        await rejectSuggestion(page);
        await assertEditorContent(page, "python", "pd.DataFrame({'value': [3]})");
        await assertAcceptRejectUI(page, { visible: false });
      });
    });
  });
});
