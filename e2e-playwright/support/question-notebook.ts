/**
 * Per-spec helpers for tests/question-notebook.spec.ts (port of
 * e2e/test/scenarios/question/notebook.cy.spec.js).
 *
 * Everything that already exists in a shared module (notebook.ts, joins.ts,
 * ad-hoc-question.ts, custom-column-3.ts, click-behavior.ts, dnd.ts, ui.ts …)
 * is imported there; this file holds only the pieces the shared surface does
 * not cover.
 */
import type { Locator, Page } from "@playwright/test";

import { expect } from "./fixtures";
import { moveDnDKitElementSynthetic } from "./dnd";
import {
  enterCustomColumnDetails,
  getNotebookStep,
  miniPicker,
} from "./notebook";
import { adhocQuestionHash } from "./permissions";

/**
 * Port of H.openTable({ database, table, mode: "notebook" }) for a NON-sample
 * database. The shared `openTable` routes notebook mode through
 * joins.openTableNotebook, which hardcodes SAMPLE_DB_ID; the `median`
 * describe opens a table in the writable QA postgres.
 *
 * Readiness signal mirrors joins.visitQuestionAdhocNotebook: notebook mode
 * renders no results, so gate on the data step having rendered its table.
 */
export async function openTableNotebookInDb(
  page: Page,
  { database, table }: { database: number; table: number },
) {
  const hash = adhocQuestionHash({
    dataset_query: {
      database,
      query: { "source-table": table },
      type: "query",
    },
  });
  await page.goto(`/question/notebook#${hash}`);
  await expect(
    getNotebookStep(page, "data").getByTestId("data-step-cell"),
  ).toBeVisible();
}

/**
 * Port of the spec-local assertTableRowCount: the preview table's non-FK ID
 * cells. Scoped, because the Cypress original runs inside a `.within()`.
 */
export async function assertTableRowCount(scope: Locator, expected: number) {
  await expect(
    scope.locator(".test-Table-ID:not(.test-Table-FK)"),
  ).toHaveCount(expected);
}

/**
 * Port of the spec-local addSimpleCustomColumn: type `[Category]`, then click
 * the name input and TYPE the name into it (the Cypress original does not
 * clear it — `.click().type(name)`), then click Done.
 */
export async function addSimpleCustomColumn(page: Page, name: string) {
  await enterCustomColumnDetails(page, { formula: "[Category]", blur: true });
  const nameInput = page.getByTestId("expression-name");
  await nameInput.click();
  await page.keyboard.type(name);
  await page.getByRole("button", { name: "Done", exact: true }).click();
}

/**
 * Port of the drag-and-drop spec's `moveElement`: drag the notebook clause
 * named `name` by the given offset, then assert the scoped notebook-cell-item
 * at `index` carries that text.
 *
 * `useMouseEvents: true` upstream → moveDnDKitElementSynthetic (the MouseSensor
 * synthetic-event dragger), which mirrors the Cypress event sequence exactly.
 */
export async function moveNotebookElement(
  scope: Locator,
  {
    name,
    horizontal,
    vertical,
    index,
  }: { name: string; horizontal?: number; vertical?: number; index: number },
) {
  const dragElement = scope.getByText(name, { exact: true });
  await expect(dragElement).toBeVisible();
  await moveDnDKitElementSynthetic(dragElement, { horizontal, vertical });
  await expect(
    scope.getByTestId("notebook-cell-item").nth(index),
  ).toHaveText(name);
}

/** Pick a database + table in the mini picker (the repeated beforeEach shape). */
export async function pickMiniPickerTable(
  page: Page,
  database: string,
  table: string,
) {
  await miniPicker(page).getByText(database, { exact: true }).click();
  await miniPicker(page).getByText(table, { exact: true }).click();
}
