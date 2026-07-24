/**
 * Shared notebook-editor / query-builder helpers, ported from
 * e2e-notebook-helpers.ts, e2e-custom-column-helpers.ts, and the QB parts of
 * e2e-ui-elements-helpers.js. Shared by the question/joins/models/metrics
 * spec ports.
 */
import { Locator, Page, expect } from "@playwright/test";

import { adhocQuestionHash } from "./native-editor";

export function queryBuilderMain(page: Page): Locator {
  return page.getByTestId("query-builder-main");
}

export function viewFooter(page: Page): Locator {
  return page.getByTestId("view-footer");
}

export function notebookButton(page: Page): Locator {
  return page
    .getByTestId("qb-header-action-panel")
    .getByTestId("notebook-button");
}

/** Switch to the notebook editor from a simple query view. */
export async function openNotebook(page: Page) {
  await notebookButton(page).click();
}

/** Select a notebook step like filter, join, breakout, etc. */
export function getNotebookStep(
  page: Page,
  type: string,
  { stage = 0, index = 0 } = {},
): Locator {
  return page.getByTestId(`step-${type}-${stage}-${index}`);
}

/**
 * Port of H.visualize: click Visualize and wait for the dataset query.
 * Returns the /api/dataset response for optional assertions.
 */
export async function visualize(page: Page) {
  const dataset = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset",
  );
  await page.getByRole("button", { name: "Visualize", exact: true }).click();
  return dataset;
}

export function miniPicker(page: Page): Locator {
  return page.getByTestId("mini-picker");
}

export function entityPickerModal(page: Page): Locator {
  return page.getByTestId("entity-picker-modal");
}

export function entityPickerModalLevel(page: Page, level: number): Locator {
  return page.getByTestId(`item-picker-level-${level}`);
}

/**
 * Port of the CURRENT H.startNewQuestion (e2e-ad-hoc-question-helpers.js): a
 * deep link to /question/notebook with a blank-card hash. This replaces an
 * older app-bar "New" → "Question" flow that required a loaded page and could
 * not work from admin/data-studio routes (no New button there); three ports
 * (multiple-column-breakouts, chart-drill, models) re-implemented the URL form
 * before this consolidation. Mirrors newCardHash: no `display` key, so
 * adhocQuestionHash fills display:"table" with displayIsLocked:false (exactly
 * the Cypress hash).
 */
export async function startNewQuestion(page: Page) {
  const hash = adhocQuestionHash({
    type: "question",
    creationType: "custom_question",
    dataset_query: {
      database: null,
      query: { "source-table": null },
      type: "query",
    },
    visualization_settings: {},
  });
  await page.goto(`/question/notebook#${hash}`);
}

/** Port of H.assertQueryBuilderRowCount. */
export async function assertQueryBuilderRowCount(page: Page, count: number) {
  const rowText = count === 1 ? "row" : "rows";
  await expect(
    page.getByTestId("question-row-count"),
  ).toContainText(`${count.toLocaleString("en-US")} ${rowText}`);
}

export function tableHeaderColumn(page: Page, name: string): Locator {
  // Scope to the interactive table header (H.tableInteractiveHeader =
  // getByTestId("table-header")), matching the Cypress helper. Page-wide
  // header-cell matching caught a second "Quantity" from the sticky
  // object-detail column on the drill dashboard (CI batch-9 s5).
  return page
    .getByTestId("table-header")
    .getByTestId("header-cell")
    .filter({ hasText: new RegExp(`^${escapeRegExp(name)}$`) });
}

export async function tableHeaderClick(page: Page, name: string) {
  // Click the header's text, not the cell center — wide cells (e.g.
  // "Created At") can have their center over the resize gutter, where the
  // click is swallowed and the column popover never opens.
  await tableHeaderColumn(page, name)
    .getByText(name, { exact: true })
    .first()
    .click();
}

export function expressionEditorWidget(page: Page): Locator {
  return page.getByTestId("expression-editor");
}

const expressionInput = (page: Page): Locator =>
  page.getByTestId("custom-expression-query-editor").locator(".cm-content");

/**
 * Minimal port of H.enterCustomColumnDetails: CodeMirror expression input via
 * native keyboard (no realPress machinery needed in Playwright).
 */
export async function enterCustomColumnDetails(
  page: Page,
  {
    formula,
    name,
    blur = true,
  }: { formula: string; name?: string; blur?: boolean },
) {
  const input = expressionInput(page);
  await input.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(formula, { delay: 10 });

  if (blur) {
    await input.blur();
  }

  if (name) {
    const nameInput = page.getByTestId("expression-name");
    await nameInput.fill(name);
    await nameInput.blur();
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
