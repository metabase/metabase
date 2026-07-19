/**
 * Helpers for the transforms-codegen spec port
 * (e2e/test/scenarios/metabot/transforms-codegen.cy.spec.ts).
 *
 * Metabot generates transform code: the (stubbed) agent streams back a
 * `transform_suggestion` data part carrying a full transform JSON, and the UI
 * shows the proposed source in the chat sidebar plus a diff with accept/reject
 * buttons in the transform's query editor. The LLM is STUBBED, never real — POST
 * /api/metabot/agent-streaming is mocked with a canned SSE body built from the
 * shared support/metabot.ts builders (imported read-only). No API key is used;
 * `llm-anthropic-api-key` is set only so the model reads as "configured".
 *
 * Lives in its own file so the shared support modules stay untouched
 * (PORTING.md rule 9). The whole upstream spec restores the `postgres-writable`
 * snapshot and drives WRITABLE_DB_ID (the writable QA postgres), which is not in
 * the jar's snapshots nor provisioned in this spike — so the spec is gated on
 * PW_QA_DB_ENABLED and SKIPS on the jar (PORTING infra-gate rule). The
 * knex-backed resetTestTable mirrors the Cypress db task; `knex`/`pg` are not
 * dependencies of this package, so the require is lazy (the module must still
 * load with the gate off and the drivers absent).
 */
import { type Locator, type Page, expect } from "@playwright/test";

import {
  createMetabotSSEBody,
  metabotDataPart,
  metabotTextPart,
  sendMetabotMessage,
} from "./metabot";
import type { MetabaseApi } from "./api";
import { focusNativeEditor, nativeEditor } from "./native-editor";
import { WRITABLE_DB_ID } from "./schema-viewer";

export const SOURCE_TABLE = "Animals";

// ---------------------------------------------------------------------------
// Types (inlined — the e2e-playwright tsconfig has no path aliases, so the
// metabase-types/api PythonTransformTableAliases can't be imported).
// ---------------------------------------------------------------------------

export type PythonTransformTableAliases = Array<{
  alias: string;
  table_id: number;
  database_id: number;
  schema: string;
}>;

// ---------------------------------------------------------------------------
// Writable-DB table reset (port of H.resetTestTable({ type, table }))
// ---------------------------------------------------------------------------

// Writable-postgres connection facts from e2e/support/cypress_data.js
// (WRITABLE_DB_CONFIG.postgres).
const WRITABLE_PG_CONFIG = {
  client: "pg",
  connection: {
    host: "localhost",
    user: "metabase",
    password: "metasample123",
    database: "writable_db",
    port: 5404,
    ssl: false,
  },
};

type SchemaBuilder = {
  createSchemaIfNotExists(name: string): Promise<unknown>;
  withSchema(name: string): {
    dropTableIfExists(table: string): Promise<unknown>;
    createTable(table: string, cb: (t: unknown) => void): Promise<unknown>;
  };
};
type KnexClient = {
  schema: SchemaBuilder;
  (tableName: string): { insert(rows: Record<string, unknown>[]): Promise<unknown> };
  destroy(): Promise<void>;
};

function knexClient(): KnexClient {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Knex = require("knex") as (config: unknown) => KnexClient;
  return Knex(WRITABLE_PG_CONFIG);
}

/**
 * Port of H.resetTestTable({ type: "postgres", table: "many_schemas" })
 * (cy.task("resetTable") → e2e/support/test_tables.js `many_schemas`): 26
 * schemas (Schema A … Schema Z), each with one `Animals` table.
 */
export async function resetManySchemasTable() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const rows = [
    { name: "Duck", score: 10 },
    { name: "Horse", score: 20 },
    { name: "Cow", score: 30 },
  ];
  const client = knexClient();
  try {
    for (const letter of alphabet) {
      const schemaName = `Schema ${letter}`;
      await client.schema.createSchemaIfNotExists(schemaName);
      await client.schema.withSchema(schemaName).dropTableIfExists("Animals");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await client.schema.withSchema(schemaName).createTable("Animals", (t: any) => {
        t.string("name");
        t.integer("score");
      });
      await client(`${schemaName}.Animals`).insert(rows);
    }
  } finally {
    await client.destroy();
  }
}

// ---------------------------------------------------------------------------
// Transform fixtures (POST /api/transform)
// ---------------------------------------------------------------------------

type CreatedTransform = { id: number; [key: string]: unknown };

/** Port of H.createSqlTransform (e2e-transform-helpers.ts), subset used here. */
export async function createSqlTransform(
  api: MetabaseApi,
  {
    sourceQuery,
    targetTable,
    targetSchema,
    name = "SQL transform",
  }: {
    sourceQuery: string;
    targetTable: string;
    targetSchema: string;
    name?: string;
  },
): Promise<CreatedTransform> {
  const response = await api.post("/api/transform", {
    name,
    description: null,
    source: {
      type: "query",
      query: {
        database: WRITABLE_DB_ID,
        type: "native",
        native: { query: sourceQuery },
      },
    },
    target: {
      type: "table",
      database: WRITABLE_DB_ID,
      name: targetTable,
      schema: targetSchema,
    },
  });
  return (await response.json()) as CreatedTransform;
}

/** Port of H.createPythonTransform (e2e-transform-helpers.ts). */
export async function createPythonTransform(
  api: MetabaseApi,
  {
    body,
    sourceTables,
    targetTable,
    targetSchema,
  }: {
    body: string;
    sourceTables: PythonTransformTableAliases;
    targetTable: string;
    targetSchema: string;
  },
): Promise<CreatedTransform> {
  const response = await api.post("/api/transform", {
    name: "Python transform",
    description: null,
    source: {
      type: "python",
      "source-database": WRITABLE_DB_ID,
      "source-tables": sourceTables,
      body,
    },
    target: {
      type: "table",
      database: WRITABLE_DB_ID,
      name: targetTable,
      schema: targetSchema,
    },
  });
  return (await response.json()) as CreatedTransform;
}

/** Port of the spec-local pythonSourceTables. */
export function pythonSourceTables(
  alias: string,
  tableId: number,
  schema = "Schema A",
  databaseId = WRITABLE_DB_ID,
): PythonTransformTableAliases {
  return [{ alias, table_id: tableId, database_id: databaseId, schema }];
}

// ---------------------------------------------------------------------------
// Canned SSE body builders (port of the spec-local mock JSON helpers)
// ---------------------------------------------------------------------------

export const createMockNativeTransformJSON = (
  id: number | null,
  databaseId: number,
  sql: string,
) =>
  `{"id":${id},"name":"A number","entity_id":null,"description":"","source":{"type":"query","query":{"database":${databaseId},"type":"native","native":{"query":"${sql}","template-tags":{}}}},"target":{"type":"table","name":""},"created_at":null,"updated_at":null}`;

export const createMockPythonTransformJSON = (
  id: number | null,
  databaseId: number,
  sourceTables: PythonTransformTableAliases,
  body: string,
) =>
  `{"id":${id},"name":"A number","entity_id":null,"description":"","source":{"type":"python","source-database":${databaseId},"source-tables":${JSON.stringify(sourceTables)},"body":"${body}"},"target":{"type":"table","name":""},"created_at":null,"updated_at":null}`;

/**
 * Port of the spec-local createMockTransformSuggestionResponse: a streamed text
 * message followed by a `transform_suggestion` data part (the parsed transform
 * JSON) and an empty `state` data part.
 */
export const createMockTransformSuggestionResponse = (
  text: string,
  transformJSON: string,
): string =>
  createMetabotSSEBody(
    metabotTextPart(text),
    metabotDataPart("transform_suggestion", JSON.parse(transformJSON)),
    metabotDataPart("state", {}),
  );

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

type EditorType = "native" | "python";

/** Port of visitTransformListPage. */
export async function visitTransformListPage(page: Page) {
  await page.goto("/data-studio/transforms");
}

/** Port of getMetabotButton: findByRole("button", { name: /Chat with Metabot/ }). */
export function getMetabotButton(page: Page): Locator {
  return page.getByRole("button", { name: /Chat with Metabot/ });
}

/** Port of suggestions(): findAllByTestId("metabot-chat-suggestion"). */
export function suggestions(page: Page): Locator {
  return page.getByTestId("metabot-chat-suggestion");
}

/** Port of lastSuggestion(): suggestions().last(). */
export function lastSuggestion(page: Page): Locator {
  return suggestions(page).last();
}

/**
 * Port of viewLastSuggestion():
 * lastSuggestion().findAllByRole("button", { name: /apply|create/i }).click().
 * Cypress clicks the single match; .first() satisfies strict mode.
 */
export async function viewLastSuggestion(page: Page) {
  await lastSuggestion(page)
    .getByRole("button", { name: /apply|create/i })
    .first()
    .click();
}

export function acceptSuggestionBtn(page: Page): Locator {
  return page.getByTestId("accept-proposed-changes-button");
}

export async function acceptSuggestion(page: Page) {
  await acceptSuggestionBtn(page).click();
}

export function rejectSuggestionBtn(page: Page): Locator {
  return page.getByTestId("reject-proposed-changes-button");
}

export async function rejectSuggestion(page: Page) {
  await rejectSuggestionBtn(page).click();
}

/** Port of H.DataStudio.Transforms.queryEditor(). */
export function queryEditor(page: Page): Locator {
  return page.getByTestId("transform-query-editor");
}

/** The CodeMirror content element for the given editor type. */
export function editorContent(page: Page, editorType: EditorType): Locator {
  return editorType === "native"
    ? nativeEditor(page)
    : page.locator("[data-testid=python-editor] .cm-content");
}

/**
 * Port of assertSuggestionInSidebar: the last suggestion contains the new
 * source (and, if given, the old source). Cypress `should("contain", …)` is a
 * case-sensitive substring — toContainText(string) matches the same way.
 */
export async function assertSuggestionInSidebar(
  page: Page,
  values: { oldSourcePartial?: string; newSourcePartial: string },
) {
  await expect(lastSuggestion(page)).toContainText(values.newSourcePartial);
  if (values.oldSourcePartial) {
    await expect(lastSuggestion(page)).toContainText(values.oldSourcePartial);
  }
}

/**
 * Port of assertEditorDiffState: the query editor's apply/create + reject
 * buttons either both exist or both don't.
 */
export async function assertEditorDiffState(
  page: Page,
  opts: { exists: boolean },
) {
  const applyOrCreate = queryEditor(page).getByRole("button", {
    name: /apply|create/i,
  });
  const reject = queryEditor(page).getByRole("button", { name: /reject/i });
  if (opts.exists) {
    await expect(applyOrCreate.first()).toBeVisible();
    await expect(reject.first()).toBeVisible();
  } else {
    await expect(applyOrCreate).toHaveCount(0);
    await expect(reject).toHaveCount(0);
  }
}

/** Port of assertEditorContent: the editor's content contains `content`. */
export async function assertEditorContent(
  page: Page,
  editorType: EditorType,
  content: string,
) {
  await expect(editorContent(page, editorType)).toContainText(content);
}

/**
 * Port of makeManualEdit: editor.clear().paste(newContent). clear() is
 * focus + select-all + backspace; paste() dispatches a synthetic paste with the
 * text on the clipboard (the Cypress helper dispatches a ClipboardEvent too —
 * cy.type doesn't work on CodeMirror).
 */
export async function makeManualEdit(
  page: Page,
  editorType: EditorType,
  newContent: string,
) {
  if (editorType === "native") {
    await focusNativeEditor(page);
  } else {
    await focusPythonEditor(page);
  }
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  await editorContent(page, editorType).evaluate((el, text) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", text);
    el.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData,
      }),
    );
  }, newContent);
}

/** Port of PythonEditor.focus() (codeMirrorHelpers), mirroring focusNativeEditor. */
async function focusPythonEditor(page: Page) {
  await expect(page.getByTestId("loading-indicator")).toHaveCount(0);
  await editorContent(page, "python").click();
  await expect(page.locator("[data-testid=python-editor] .cm-editor")).toHaveClass(
    /cm-focused/,
  );
  await page.keyboard.press("End");
}

/**
 * Port of assertAcceptRejectUI: the accept/reject buttons are visible or absent.
 */
export async function assertAcceptRejectUI(
  page: Page,
  opts: { visible: boolean },
) {
  if (opts.visible) {
    await expect(acceptSuggestionBtn(page)).toBeVisible();
    await expect(rejectSuggestionBtn(page)).toBeVisible();
  } else {
    await expect(acceptSuggestionBtn(page)).toHaveCount(0);
    await expect(rejectSuggestionBtn(page)).toHaveCount(0);
  }
}

/**
 * Port of sendCodgenBotMessage: send the message, wait for the agent-streaming
 * response, and assert the request body carried the transforms_codegen profile.
 * The wait is registered before sending (PORTING rule 2); the mocked route's
 * fulfill still produces a response for waitForResponse.
 */
export async function sendCodgenBotMessage(page: Page, message: string) {
  const agentResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/metabot/agent-streaming" &&
      response.request().method() === "POST",
  );
  await sendMetabotMessage(page, message);
  const response = await agentResponse;
  expect(response.request().postDataJSON()).toMatchObject({
    profile_id: "transforms_codegen",
  });
}
