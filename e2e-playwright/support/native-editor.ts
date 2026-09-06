/**
 * Ports of the native/SQL editor `H` helpers:
 * - e2e-ad-hoc-question-helpers.js (startNewNativeQuestion, adhocQuestionHash)
 * - e2e-codemirror-helpers.ts / e2e-native-editor-helpers.ts (NativeEditor.*)
 *
 * CodeMirror porting notes:
 * - Cypress cy.type() doesn't work on CodeMirror, so the Cypress helpers use
 *   cypress-real-events (CDP input). Playwright's page.keyboard IS CDP input,
 *   so a plain click-to-focus + page.keyboard.type() is the equivalent — no
 *   escape-sequence machinery needed for plain text.
 * - The Cypress focus() clicks the right edge of .cm-content (force: true) to
 *   land the caret at the end. Here we click the content and press End, which
 *   is exact for the single-line queries these specs use. (The Cypress
 *   comment warns End regressed two multi-line repros — revisit with
 *   "ControlOrMeta+End" / click-position math if a multi-line port needs it.)
 */
import type { Locator, Page } from "@playwright/test";

import { expect } from "./fixtures";
import { SAMPLE_DB_ID } from "./sample-data";

/** Port of adhocQuestionHash (the btoa'd card definition in the URL hash). */
export function adhocQuestionHash(question: {
  display?: string;
  [key: string]: unknown;
}): string {
  const questionWithDisplay = {
    display: "table",
    // without "locking" the display, the QB will run its picking logic and
    // override the setting
    displayIsLocked: question.display != null,
    ...question,
  };
  return Buffer.from(JSON.stringify(questionWithDisplay), "utf-8").toString(
    "base64",
  );
}

type NativeQuestionConfig = {
  database?: number;
  query?: string;
  collection_id?: number | null;
  display?: string;
  visualization_settings?: Record<string, unknown>;
};

/**
 * Port of H.startNewNativeQuestion: visit the ad-hoc URL that clicking
 * "New" > "SQL query" generates.
 */
export async function startNewNativeQuestion(
  page: Page,
  config: NativeQuestionConfig = {},
) {
  const {
    database = SAMPLE_DB_ID,
    query = "",
    collection_id = null,
    display = "scalar",
    visualization_settings = {},
  } = config;

  const card = {
    collection_id,
    dataset_query: {
      database,
      native: { query, "template-tags": {} },
      type: "native",
    },
    display,
    parameters: [],
    visualization_settings,
    type: "question",
  };

  await page.goto(`/question#${adhocQuestionHash(card)}`);
}

// === ports of codeMirrorHelpers("native-query-editor", ...) ===

/** Port of NativeEditor.get(): the CodeMirror content element. */
export function nativeEditor(page: Page): Locator {
  return page.locator("[data-testid=native-query-editor] .cm-content");
}

/**
 * Port of NativeEditor.focus(): wait for loading to finish, click the editor,
 * confirm CodeMirror took focus, then move the caret to the end of the line.
 */
export async function focusNativeEditor(page: Page) {
  await expect(page.getByTestId("loading-indicator")).toHaveCount(0);
  await nativeEditor(page).click();
  await expect(
    page.locator("[data-testid=native-query-editor] .cm-editor"),
  ).toHaveClass(/cm-focused/);
  await page.keyboard.press("End");
}

/**
 * Port of NativeEditor.type() for plain text (no {escape} sequences): real
 * keyboard input, same 10ms inter-key delay as the Cypress realType default.
 */
export async function typeInNativeEditor(
  page: Page,
  text: string,
  { focus = true }: { focus?: boolean } = {},
) {
  if (focus) {
    await focusNativeEditor(page);
  }
  await page.keyboard.type(text, { delay: 10 });
}

/** Port of NativeEditor.completions(): the autocomplete tooltip. */
export function nativeEditorCompletions(page: Page): Locator {
  return page.locator(".cm-tooltip-autocomplete");
}

/**
 * Port of NativeEditor.completion(label): completion rows whose label
 * contains the text. Matches cy.contains semantics (case-sensitive
 * substring) via a regex — Playwright's hasText strings are case-insensitive.
 * Returns ALL matches; use .first() where Cypress's first-match behavior is
 * intended, or toHaveCount() to assert uniqueness.
 */
export function nativeEditorCompletion(page: Page, label: string): Locator {
  return nativeEditorCompletions(page)
    .locator(".cm-completionLabel")
    .filter({ hasText: new RegExp(escapeRegExp(label)) })
    .locator("..");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
