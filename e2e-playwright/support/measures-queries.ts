/**
 * Spec-local helpers for measures-queries.spec.ts — the pieces of the Cypress
 * measures-queries spec's own helpers plus the small ports it needs that no
 * shared module already provides:
 *
 *  - MeasureEditor (e2e-datamodel-helpers.ts) — the new/edit-measure page.
 *  - DataStudio.Tables.visitNewMeasurePage (e2e-data-studio-helpers.ts).
 *  - updateMeasure (e2e-table-metadata-helpers.js — PUT /api/measure/:id).
 *  - the CustomExpressionEditor type/clear/name pieces the aggregation editor
 *    uses (codeMirror helpers) — real keystrokes, mirroring custom-column-3.ts.
 *  - the spec-local startNewMeasure / saveMeasure / useMeasureInAdhocQuestion /
 *    breakout / verifyScalarValue / verifyRowValues.
 *
 * Everything else is imported read-only from the shared support modules.
 * Lives in its own file so the shared support modules stay untouched.
 */
import type { Locator, Page } from "@playwright/test";

import { openTable } from "./ad-hoc-question";
import type { MetabaseApi } from "./api";
import { customExpressionEditor } from "./custom-column";
import { expect } from "./fixtures";
import { summarize } from "./models";
import {
  assertQueryBuilderRowCount,
  getNotebookStep,
  queryBuilderMain,
  viewFooter,
  visualize,
} from "./notebook";
import { tableInteractiveBody } from "./question-new";
import { popover } from "./ui";

const MEASURE_NAME = "Table Measure";

// === MeasureEditor (e2e-datamodel-helpers.ts) ===

/**
 * Port of getMeasureEditor(): the new-measure OR measure-detail page. Cypress
 * used `cy.get("[data-testid='new-measure-page'], [data-testid='measure-detail-page']")`.
 */
function measureEditorRoot(page: Page): Locator {
  return page.locator(
    "[data-testid='new-measure-page'], [data-testid='measure-detail-page']",
  );
}

export const MeasureEditor = {
  get: (page: Page): Locator => measureEditorRoot(page),
  /** getMeasureEditorNameInput: findByPlaceholderText("New measure"). */
  getNameInput: (page: Page): Locator =>
    measureEditorRoot(page).getByPlaceholder("New measure"),
  /** getMeasureEditorAggregationPlaceholder: findByText("Pick an aggregation function"). */
  getAggregationPlaceholder: (page: Page): Locator =>
    measureEditorRoot(page).getByText("Pick an aggregation function", {
      exact: true,
    }),
  /** getMeasureEditorSaveButton: .button("Save"). */
  getSaveButton: (page: Page): Locator =>
    measureEditorRoot(page).getByRole("button", { name: "Save", exact: true }),
};

/**
 * Port of H.DataStudio.Tables.visitNewMeasurePage(tableId):
 * cy.visit(`/data-studio/library/tables/${tableId}/measures/new`).
 */
export async function visitNewMeasurePage(page: Page, tableId: number) {
  await page.goto(`/data-studio/library/tables/${tableId}/measures/new`);
}

// === CustomExpressionEditor (e2e-codemirror-helpers.ts subset) ===
//
// The aggregation editor is the same CodeMirror `custom-expression-query-editor`
// widget as the notebook custom-column editor, so real keystrokes drive it
// (page.keyboard IS CDP input, the equivalent of the Cypress realType the
// upstream helper uses). Focus is asserted before typing — page.keyboard types
// at document.activeElement with no retry.

const EDITOR_TESTID = "custom-expression-query-editor";

async function focusCustomExpression(page: Page) {
  await customExpressionEditor(page).click();
  await expect(
    page.getByTestId(EDITOR_TESTID).locator(".cm-editor"),
  ).toHaveClass(/cm-focused/);
  // The Cypress focus() clicks the right edge so the caret lands at the end.
  await page.keyboard.press("End");
}

/** Port of H.CustomExpressionEditor.clear(): focus, select all, backspace. */
export async function clearCustomExpression(page: Page) {
  await focusCustomExpression(page);
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
}

/**
 * Port of H.CustomExpressionEditor.type(): real keystrokes. `focus:false`
 * preserves the current caret (used right after clear()). The measure spec
 * only types plain expression text (brackets / arithmetic / the → arrow), no
 * escape sequences, so no {…} handling is needed.
 */
export async function typeCustomExpression(
  page: Page,
  text: string,
  { focus = true }: { focus?: boolean } = {},
) {
  if (focus) {
    await focusCustomExpression(page);
  }
  await page.keyboard.type(text, { delay: 10 });
}

/**
 * Port of H.CustomExpressionEditor.blur(): the upstream clicks the widget's
 * bottom-right to move focus out; blurring the content node fires the same
 * blur handler.
 */
export async function blurCustomExpression(page: Page) {
  await customExpressionEditor(page).blur();
}

/** Port of H.CustomExpressionEditor.nameInput(): testid "expression-name". */
export function customExpressionName(page: Page): Locator {
  return page.getByTestId("expression-name");
}

// === updateMeasure (e2e-table-metadata-helpers.js) ===

/** Port of H.updateMeasure: PUT /api/measure/:id. */
export async function updateMeasure(
  api: MetabaseApi,
  {
    id,
    name,
    definition,
    description = null,
  }: {
    id: number;
    name?: string;
    definition?: Record<string, unknown>;
    description?: string | null;
  },
  { revision_message = "Update measure" }: { revision_message?: string } = {},
) {
  // Cypress cy.request drops `undefined` fields from the JSON body — mirror that
  // so a rename-only update doesn't wipe the definition.
  const body: Record<string, unknown> = { description, revision_message };
  if (name !== undefined) {
    body.name = name;
  }
  if (definition !== undefined) {
    body.definition = definition;
  }
  await api.put(`/api/measure/${id}`, body);
}

// === spec-local flow helpers ===

/** Port of the spec's startNewMeasure. */
export async function startNewMeasure(
  page: Page,
  { name = MEASURE_NAME, tableId }: { name?: string; tableId: number },
) {
  await visitNewMeasurePage(page, tableId);
  await MeasureEditor.getNameInput(page).fill(name);
}

/**
 * Port of the spec's saveMeasure: click Save, wait for POST /api/measure, and
 * assert the "Measure created" toast. The Cypress version returns the created
 * measure, but no caller uses the return value.
 */
export async function saveMeasure(page: Page) {
  const create = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/measure",
  );
  await MeasureEditor.getSaveButton(page).click();
  await create;
  await expectUndoToast(page, "Measure created");
}

/**
 * Assert an undo toast containing `text` is visible. Toasts stack and a
 * previous one can still be fading when the next appears, so filter to the
 * matching toast (case-sensitive substring, like cy.contains / contain.text)
 * rather than resolving the bare testid, which would be a strict-mode multi-match.
 */
export async function expectUndoToast(page: Page, text: string) {
  await expect(
    page
      .getByTestId("toast-undo")
      .filter({ hasText: new RegExp(escapeRegExp(text)) })
      .first(),
  ).toBeVisible();
}

/** Port of the spec's useMeasureInAdhocQuestion. */
export async function useMeasureInAdhocQuestion(
  page: Page,
  {
    measureName = MEASURE_NAME,
    tableId,
    customizeQuery,
  }: {
    measureName?: string;
    tableId: number;
    customizeQuery?: () => Promise<void>;
  },
) {
  await openTable(page, { table: tableId, mode: "notebook" });
  await summarize(page, { mode: "notebook" });
  await popover(page).getByText("Measures", { exact: true }).click();
  await popover(page).getByText(measureName, { exact: true }).click();

  await customizeQuery?.();

  await visualize(page);
}

/** Port of the spec's breakout(columnName). */
export async function breakout(page: Page, columnName = "Created At") {
  await getNotebookStep(page, "summarize")
    .getByText("Pick a column to group by", { exact: true })
    .click();
  await popover(page).getByText(columnName, { exact: true }).click();
}

/** Port of the spec's verifyScalarValue. */
export async function verifyScalarValue(page: Page, scalarValue: string) {
  await expect(queryBuilderMain(page).getByTestId("scalar-value")).toHaveText(
    scalarValue,
  );
  await assertQueryBuilderRowCount(page, 1);
}

/**
 * Port of the spec's verifyRowValues (a custom H.assertTableData that allows
 * for empty cells: empty result cells render no cell-data testid, so the
 * flattened non-empty values map straight onto the cell-data list by index).
 */
export async function verifyRowValues(page: Page, rowValues: string[][]) {
  // The display toggle is a Mantine SegmentedControl whose options both carry
  // `disabled: true`; the toggle behaviour lives in an onClick on the control
  // root, so Playwright's actionability (which walks up to the disabled option)
  // refuses a normal click — force it (wave-10 aria-disabled-ancestor gotcha).
  await viewFooter(page)
    .getByLabel("Switch to data", { exact: true })
    .click({ force: true });

  const cells = tableInteractiveBody(page).getByTestId("cell-data");
  const flat = rowValues.flat();
  await expect
    .poll(() => cells.count())
    .toBeGreaterThan(rowValues.length);

  for (let index = 0; index < flat.length; index++) {
    await expect(cells.nth(index)).toHaveText(flat[index]);
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
