/**
 * Helpers for custom-column-3.spec.ts — ports of the pieces of
 * H.CustomExpressionEditor (e2e-custom-column-helpers.ts /
 * e2e-codemirror-helpers.ts), the scoped notebook-action helpers, and the
 * spec-local assertTableData used by the path/splitPart tests.
 *
 * Lives in its own file so the shared support modules stay untouched.
 *
 * The custom-column expression editor is CodeMirror, so real keystrokes drive
 * it (page.keyboard IS CDP input, the equivalent of the Cypress realType the
 * upstream helper uses). Focus is asserted before typing — page.keyboard types
 * at document.activeElement with no retry.
 */
import type { Locator, Page } from "@playwright/test";

import { expect } from "./fixtures";
import type { MetabaseApi } from "./api";
import { customExpressionEditor } from "./custom-column";

const EDITOR_TESTID = "custom-expression-query-editor";

/**
 * Port of H.CustomExpressionEditor.focus(): click the editor, confirm
 * CodeMirror took focus, then move the caret to the end of the line (the
 * upstream focus() clicks the right edge so the caret lands at the end).
 */
export async function focusCustomExpressionEditor(page: Page) {
  await customExpressionEditor(page).click();
  await expect(
    page.getByTestId(EDITOR_TESTID).locator(".cm-editor"),
  ).toHaveClass(/cm-focused/);
  await page.keyboard.press("End");
}

/** Port of H.CustomExpressionEditor.clear(): focus, select all, backspace. */
export async function clearCustomExpressionEditor(page: Page) {
  await focusCustomExpressionEditor(page);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
}

/**
 * Port of H.CustomExpressionEditor.type(): real keystrokes with the small set
 * of escape sequences this spec uses ({rightarrow} etc). focus:false skips the
 * click so the existing caret position is preserved (the upstream uses this
 * after inserting from the function browser).
 */
export async function customExpressionEditorType(
  page: Page,
  text: string,
  { focus = true }: { focus?: boolean } = {},
) {
  if (focus) {
    await focusCustomExpressionEditor(page);
  }

  const parts = text.split(/(\{[^}]+\})/);
  for (const part of parts) {
    if (part === "") {
      continue;
    }
    switch (part.toLowerCase()) {
      case "{rightarrow}":
        await page.keyboard.press("ArrowRight");
        break;
      case "{leftarrow}":
        await page.keyboard.press("ArrowLeft");
        break;
      case "{enter}":
        await page.keyboard.press("Enter");
        break;
      case "{backspace}":
        await page.keyboard.press("Backspace");
        break;
      default:
        await page.keyboard.type(part, { delay: 10 });
    }
  }
}

/**
 * Port of H.CustomExpressionEditor.value().should("eq"/"equal", expected):
 * the editor's multiline text (placeholder lines skipped), joined with
 * newlines. Retried like the Cypress .should().
 */
export async function expectCustomExpressionValue(page: Page, expected: string) {
  await expect
    .poll(() =>
      customExpressionEditor(page).evaluate((el) => {
        const lines = Array.from(el.querySelectorAll(".cm-line"));
        return lines
          .filter((line) => !line.querySelector(".cm-placeholder"))
          .map((line) => line.textContent ?? "")
          .join("\n");
      }),
    )
    .toBe(expected);
}

/** Port of H.CustomExpressionEditor.completions(). */
export function customExpressionCompletions(page: Page): Locator {
  return page.getByTestId("custom-expression-editor-suggestions");
}

/**
 * Port of H.CustomExpressionEditor.completion(name):
 * completions().findAllByRole("option").contains(name).first() — cy.contains
 * is a case-sensitive substring, so a regex + .first().
 */
export function customExpressionCompletion(page: Page, name: string): Locator {
  return customExpressionCompletions(page)
    .getByRole("option")
    .filter({ hasText: new RegExp(escapeRegExp(name)) })
    .first();
}

/** Port of H.CustomExpressionEditor.functionBrowser(). */
export function functionBrowser(page: Page): Locator {
  return page.getByTestId("expression-editor-function-browser");
}

/** Port of H.CustomExpressionEditor.nameInput(). */
export function customExpressionName(page: Page): Locator {
  return page.getByTestId("expression-name");
}

/** Port of H.CustomExpressionEditor.format(): click the Auto-format button. */
export async function formatExpression(page: Page) {
  const button = page.getByLabel("Auto-format", { exact: true });
  await expect(button).toBeVisible();
  await button.click();
}

/** Port of H.setModelMetadata (e2e-models-metadata-helpers.js). */
export async function setModelMetadata(
  api: MetabaseApi,
  modelId: number,
  mapFn: (field: Record<string, unknown>) => Record<string, unknown>,
) {
  const response = await api.get(`/api/card/${modelId}`);
  const { result_metadata } = (await response.json()) as {
    result_metadata: Record<string, unknown>[];
  };
  await api.put(`/api/card/${modelId}`, {
    result_metadata: result_metadata.map(mapFn),
  });
}

// === scoped notebook-action helpers (the H.getNotebookStep(...).within(...)
// calls: unscoped page.getByTestId("action-buttons") matches every stage's
// row under a multi-stage query, so these take the step locator). ===

/** Port of H.summarize({ mode: "notebook" }) scoped to a notebook step. */
export async function summarizeInStep(step: Locator) {
  await step.getByTestId("action-buttons").locator(".Icon-sum").click();
}

/** Port of H.filter({ mode: "notebook" }) scoped to a notebook step. */
export async function filterInStep(step: Locator) {
  await step.getByTestId("action-buttons").locator(".Icon-filter").click();
}

/** Port of H.addCustomColumn scoped to a notebook step. */
export async function addCustomColumnInStep(step: Locator) {
  await step.getByTestId("action-buttons").locator(".Icon-add_data").click();
}

/** Port of H.join() scoped to a notebook step. */
export async function joinInStep(step: Locator) {
  await step.getByRole("button", { name: "Join data", exact: true }).click();
}

/** Port of H.sort() scoped to a notebook step. */
export async function sortInStep(step: Locator) {
  await step.getByRole("button", { name: "Sort", exact: true }).click();
}

/**
 * Port of the spec-local assertTableData({ title, value }) used by the path
 * and splitPart tests: the LAST header cell and LAST body cell (a custom
 * column appended to the right of the result table).
 */
export async function assertLastColumnData(
  page: Page,
  { title, value }: { title: string; value: string },
) {
  await expect(
    page.getByTestId("table-root").getByTestId("header-cell").last(),
  ).toHaveText(title);
  await expect(
    page.getByTestId("table-body").getByTestId("cell-data").last(),
  ).toHaveText(value);
}

/** Port of H.tableInteractiveScrollContainer().scrollTo("right"). */
export async function scrollTableRight(page: Page) {
  await page
    .getByTestId("table-scroll-container")
    .evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
