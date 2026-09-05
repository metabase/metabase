/**
 * Helpers for the native-subquery and native-snippet-tags spec ports. Lives
 * in its own file so the shared support modules stay untouched. Ports of:
 * - H.createNativeQuestion in its full api/createQuestion.ts question() shape
 *   (type/collection_id/enable_embedding + the follow-up PUT) — the shared
 *   createNativeQuestion ports (sharing.ts, dashboard-management.ts) only
 *   cover plain questions, and models.ts createNativeModel only models.
 * - H.createSnippet (api/createSnippet.ts)
 * - H.NativeEditor.clear() (e2e-codemirror-helpers.ts: select-all + backspace)
 * - H.assertTableRowsCount (e2e-ui-elements-helpers.js)
 */
import type { Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { expect } from "./fixtures";
import { tableInteractive } from "./models";
import { focusNativeEditor } from "./native-editor";
import { tableInteractiveBody } from "./question-new";
import { SAMPLE_DB_ID } from "./sample-data";

type NativeCardDetails = {
  name?: string;
  /** "model" triggers the same follow-up PUT the Cypress factory does. */
  type?: "question" | "model";
  display?: string;
  database?: number;
  collection_id?: number | null;
  native: Record<string, unknown>;
  enable_embedding?: boolean;
  embedding_params?: Record<string, string>;
};

/**
 * Port of H.createNativeQuestion (api/createQuestion.ts `question()`): POST
 * the card, then — exactly like the Cypress helper — PUT the type/embedding
 * fields when a model or embedding is requested (POST /api/card ignores them).
 */
export async function createNativeCard(
  api: MetabaseApi,
  details: NativeCardDetails,
): Promise<{ id: number }> {
  const {
    name = "test question",
    type = "question",
    display = "table",
    database = SAMPLE_DB_ID,
    collection_id,
    native,
    enable_embedding = false,
    embedding_params,
  } = details;
  const response = await api.post("/api/card", {
    name,
    display,
    collection_id,
    visualization_settings: {},
    dataset_query: { type: "native", native, database },
  });
  const card = (await response.json()) as { id: number };
  if (type === "model" || enable_embedding) {
    await api.put(`/api/card/${card.id}`, {
      type,
      enable_embedding,
      embedding_params,
    });
  }
  return card;
}

/**
 * visitQuestion for saved native questions that may run ad-hoc.
 *
 * ui.ts visitQuestion assumes a saved question always runs via
 * POST /api/card/:id/query. That is false for a native card whose
 * card-reference tag is stored without the referenced card's slug
 * (`{{#5}}` rather than `{{#5-a-people-question-1}}` — the shape you get when
 * a card is created through the API with hand-written template-tags):
 * initializeQB > updateTemplateTagNames fetches the referenced card and
 * rewrites the tag name into the query text, so the loaded question no longer
 * matches the stored card, `isQueryDirty` is true, and the QB runs it through
 * POST /api/dataset instead (frontend/src/metabase/querying/run-query.ts —
 * `canUseCardApiEndpoint = !isDirty && question.isSaved()`).
 *
 * The Cypress originals use a bare `cy.visit` and never wait on the query, so
 * only the port is exposed to the endpoint choice. Waiting on either endpoint
 * keeps the load barrier without asserting which one runs.
 * See findings-inbox/native-subquery-ci-failure.md.
 */
export async function visitQuestionEitherEndpoint(page: Page, id: number) {
  const metadataResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/card/${id}/query_metadata`,
  );
  const queryResponse = page.waitForResponse((response) => {
    const { pathname } = new URL(response.url());
    return (
      response.request().method() === "POST" &&
      (pathname === "/api/dataset" || pathname === `/api/card/${id}/query`)
    );
  });
  await page.goto(`/question/${id}`);
  await Promise.all([metadataResponse, queryResponse]);
}

/** Port of H.createSnippet (api/createSnippet.ts). */
export async function createSnippet(
  api: MetabaseApi,
  details: {
    name?: string;
    description?: string | null;
    content: string;
    collection_id?: number | null;
  },
): Promise<{ id: number; name: string }> {
  const {
    name = "Test snippet",
    description = null,
    content,
    collection_id = null,
  } = details;
  const response = await api.post("/api/native-query-snippet", {
    name,
    description,
    content,
    collection_id,
  });
  return (await response.json()) as { id: number; name: string };
}

/**
 * Port of H.NativeEditor.clear(): focus, select all, backspace. Lives here
 * because the shared native-editor.ts module must stay untouched.
 */
export async function clearNativeEditor(page: Page) {
  await focusNativeEditor(page);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
}

/**
 * Port of H.assertTableRowsCount: some rows rendered (virtualization makes
 * the visible count unreliable) + the table's data-rows-count attribute.
 */
export async function assertTableRowsCount(page: Page, value: number) {
  if (value > 0) {
    await expect(
      tableInteractiveBody(page).getByRole("row").first(),
    ).toBeVisible();
  }
  await expect(tableInteractive(page)).toHaveAttribute(
    "data-rows-count",
    String(value),
  );
}
