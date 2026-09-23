/**
 * Helpers for the custom-column specs — ports of pieces of
 * e2e/support/helpers/e2e-custom-column-helpers.ts and the notebook-mode
 * branch of H.openTable. Lives in its own file so the shared support modules
 * stay untouched.
 */
import type { Locator, Page } from "@playwright/test";

import { visitQuestionAdhocNotebook } from "./joins";
import { SAMPLE_DB_ID } from "./sample-data";

/**
 * Port of H.CustomExpressionEditor.value()'s target: the CodeMirror content
 * node of the expression editor. Asserting toContainText on it matches the
 * Cypress value().should("contain", ...) semantics (case-sensitive
 * substring).
 */
export function customExpressionEditor(page: Page): Locator {
  return page
    .getByTestId("custom-expression-query-editor")
    .locator(".cm-content");
}

/** Port of H.openTable({ mode: "notebook", limit, table }). */
export function openTableNotebookWithLimit(
  page: Page,
  tableId: number,
  limit: number,
) {
  return visitQuestionAdhocNotebook(page, {
    dataset_query: {
      database: SAMPLE_DB_ID,
      query: { "source-table": tableId, limit },
      type: "query",
    },
  });
}
