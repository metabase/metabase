/**
 * Helpers for the nested-questions spec port — `H` helpers not yet in the
 * shared modules (e2e-bi-basics-helpers.js, e2e-dimension-list-helpers.js,
 * selectFilterOperator from e2e-notebook-helpers.ts, and
 * saveQuestionToCollection from e2e-misc-helpers.js).
 *
 * Kept separate from the shared support/*.ts files because those are edited
 * by parallel porting agents; fold into notebook.ts/ui.ts when consolidating.
 */
import type { Locator, Page, Response } from "@playwright/test";
import { expect } from "@playwright/test";

import { pickEntity } from "./dashboard";

/** Register a wait for the next POST /api/dataset response. Must be called
 * BEFORE the action that triggers the query. */
export function waitForDataset(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset",
  );
}

// === ports of e2e-bi-basics-helpers.js (view-mode subset) ===

/** Port of H.summarize (default, non-notebook mode). */
export async function summarize(page: Page) {
  await initiateAction(page, "Summarize");
}

/** Port of H.filter (default, non-notebook mode). */
export async function filter(page: Page) {
  await initiateAction(page, "Filter");
}

async function initiateAction(
  page: Page,
  actionType: "Summarize" | "Filter",
) {
  // Same race-condition guard as the Cypress helper: wait for any
  // "Doing science..." loader to clear before reaching for the header panel.
  await expect(page.getByText(/^Doing science/)).toHaveCount(0);
  await page
    .getByTestId("qb-header-action-panel")
    .getByText(actionType, { exact: true })
    .click();
}

// === ports of e2e-dimension-list-helpers.js ===

export function getDimensions(scope: Page | Locator): Locator {
  return scope.getByTestId("dimension-list-item");
}

/** Port of H.getDimensionByName: substring, case-sensitive (cy :contains). */
export function getDimensionByName(
  scope: Page | Locator,
  { name, index = 0 }: { name: string; index?: number },
): Locator {
  return getDimensions(scope)
    .filter({ hasText: new RegExp(escapeRegExp(name)) })
    .nth(index);
}

// === port of H.selectFilterOperator (e2e-notebook-helpers.ts) ===

export async function selectFilterOperator(page: Page, operatorName: string) {
  await page.getByLabel("Filter operator", { exact: true }).click();
  await page
    .getByRole("menu")
    .getByText(operatorName, { exact: true })
    .click();
}

// === port of H.saveQuestionToCollection (e2e-misc-helpers.js), no-rename
// subset. Resolves with the POST /api/card response body so callers can
// assert on it (the Cypress spec waits on its own @cardCreated intercept). ===

export async function saveQuestionToCollection(
  page: Page,
  { path = ["Our analytics"] }: { path?: (string | RegExp)[] } = {},
): Promise<{ id: number; dashboard_id: number | null; error?: unknown }> {
  const saveResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/card",
  );

  await page
    .getByTestId("qb-header")
    .getByRole("button", { name: "Save", exact: true })
    .click();

  const saveModal = page.getByTestId("save-question-modal");
  await saveModal.getByLabel(/Where do you want to save this/).click();
  await pickEntity(page, { path, select: true });
  await saveModal.getByRole("button", { name: "Save", exact: true }).click();

  const body = (await (await saveResponse).json()) as {
    id: number;
    dashboard_id: number | null;
    error?: unknown;
  };

  // Port of checkSavedToCollectionQuestionToast.
  if (!body.dashboard_id) {
    await expect(
      page.getByTestId("toast-undo").getByText(/Saved/i),
    ).toBeVisible();
  }

  return body;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
