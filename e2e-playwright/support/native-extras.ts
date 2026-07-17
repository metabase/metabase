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
