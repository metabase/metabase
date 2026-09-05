/**
 * Ports of the model-editing `H` helpers used by the models spec ports:
 * - e2e-ui-elements-helpers.js (modal, openQuestionActions, tableInteractive)
 * - e2e-bi-basics-helpers.js (summarize)
 * - e2e-misc-helpers.js (runNativeQuery, visitModel)
 * - e2e/test/scenarios/models/helpers/e2e-models-helpers.js (selectFromDropdown)
 * - api/createQuestion.ts, model subset (createNativeModel)
 */
import type { Locator, Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { icon } from "./dashboard-cards";
import { expect } from "./fixtures";
import { SAMPLE_DB_ID } from "./sample-data";
import { modal, popover } from "./ui";

/** Port of H.modal(). */
export { modal };

/** Port of H.tableInteractive(). */
export function tableInteractive(page: Page): Locator {
  return page.getByTestId("table-root");
}

/** Port of H.openQuestionActions: the ellipsis menu in the QB header. */
export async function openQuestionActions(page: Page, action?: string) {
  await icon(page.getByTestId("qb-header-action-panel"), "ellipsis").click();
  if (action) {
    await popover(page).getByText(action, { exact: true }).click();
  }
}

/**
 * Port of H.summarize({ mode }): the sum icon in the notebook action toolbar,
 * or the "Summarize" header button in the simple query view.
 */
export async function summarize(
  page: Page,
  { mode }: { mode?: "notebook" } = {},
) {
  if (mode === "notebook") {
    await icon(page.getByTestId("action-buttons"), "sum").click();
  } else {
    // The Cypress helper first waits out the "Doing science..." loader to
    // dodge a sidebar race, then clicks the header action.
    await expect(page.getByText(/^Doing science/)).toHaveCount(0);
    await page
      .getByTestId("qb-header-action-panel")
      .getByText(/Summarize/)
      .click();
  }
}

/**
 * Port of selectFromDropdown (models helpers): clicks an option in the
 * last (topmost) visible popover.
 */
export async function selectFromDropdown(page: Page, option: string) {
  await popover(page).last().getByText(option, { exact: true }).click();
}

/** POST /api/dataset response — the wait behind H's "@dataset" alias. */
export function waitForDataset(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset",
  );
}

/**
 * Port of H.visitModel (hasDataAccess variant): visit the model page and wait
 * for its /api/dataset query. Also covers the spec pattern
 * `cy.visit("/model/:id"); cy.wait("@dataset")`.
 */
export async function visitModel(page: Page, id: number) {
  const datasetResponse = waitForDataset(page);
  await page.goto(`/model/${id}`);
  await datasetResponse;
}

/**
 * Port of H.runNativeQuery: click the play button in the native editor, wait
 * for the dataset query, and confirm the question is no longer "dirty" (the
 * play icon is gone).
 */
export async function runNativeQuery(page: Page) {
  const datasetResponse = waitForDataset(page);
  await icon(
    page.getByTestId("native-query-editor-container"),
    "play",
  ).click();
  await datasetResponse;
  await expect(icon(page, "play")).toHaveCount(0);
}

/**
 * Port of H.createNativeQuestion({ type: "model", ... }). Mirrors the Cypress
 * factory's two-step shape: POST the card, then PUT the model type (the
 * shared createNativeQuestion in support/sharing.ts doesn't take `type`).
 */
export async function createNativeModel(
  api: MetabaseApi,
  details: {
    name?: string;
    display?: string;
    database?: number;
    native: Record<string, unknown>;
  },
): Promise<{ id: number }> {
  const {
    name = "test model",
    display = "table",
    database = SAMPLE_DB_ID,
    native,
  } = details;
  const response = await api.post("/api/card", {
    name,
    display,
    visualization_settings: {},
    dataset_query: { type: "native", native, database },
  });
  const card = (await response.json()) as { id: number };
  await api.put(`/api/card/${card.id}`, { type: "model" });
  return card;
}
