/**
 * Helpers for the models spec port (models.cy.spec.js) — the model-lifecycle
 * `H` helpers and spec-local functions not already in the shared modules:
 * - e2e/test/scenarios/models/helpers/e2e-models-helpers.js
 *   (turnIntoModel, assertIsModel, assertIsQuestion,
 *    assertQuestionIsBasedOnModel, saveQuestionBasedOnModel,
 *    selectDimensionOptionFromSidebar)
 * - e2e-ui-elements-helpers.js (closeQuestionActions)
 * - e2e-ad-hoc-question-helpers.js (startNewQuestion — the URL-navigation form)
 * - api/createNativeQuestion.ts (the native-question factory)
 * - the spec-local getCollectionItemRow/Card/getResults helpers
 *
 * Kept in its own module (imports from models.ts / notebook.ts / ui.ts etc.)
 * so the shared support files stay untouched; fold into models.ts when
 * consolidating.
 */
import type { Locator, Page, Response } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { expect } from "./fixtures";
import { openQuestionActions } from "./models";
import { nativeEditor } from "./native-editor";
import { SAMPLE_DB_ID } from "./sample-data";
import { icon, modal, popover } from "./ui";

// createNativeQuestion is now canonical in ./factories (it applies the same
// model/metric follow-up PUT the old copy did — POST omits `type`, then PUTs it
// for model/metric cards); re-exported so this module's consumers keep their
// import unchanged.
export { createNativeQuestion } from "./factories";

/**
 * Port of turnIntoModel (e2e-models-helpers.js): open the question actions,
 * click the "model" option, confirm in the modal, and wait for the PUT that
 * flips the card type (the Cypress `@cardUpdate` alias).
 */
export async function turnIntoModel(page: Page) {
  const cardUpdate = waitForCardUpdate(page);
  await openQuestionActions(page);
  await icon(popover(page), "model").click();
  await modal(page)
    .getByRole("button", { name: "Turn this into a model", exact: true })
    .click();
  await cardUpdate;
}

/** Register a wait for the next PUT /api/card/:id (the `@cardUpdate` alias). */
export function waitForCardUpdate(page: Page, id?: number): Promise<Response> {
  const pattern = id ? new RegExp(`^/api/card/${id}$`) : /^\/api\/card\/\d+$/;
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      pattern.test(new URL(response.url()).pathname),
  );
}

/**
 * Port of assertIsModel (requires the question-actions popover to be open):
 * no "turn into model" option, and none of the question-only affordances.
 */
export async function assertIsModel(page: Page) {
  await expect(icon(popover(page), "model")).toHaveCount(0);
  await expect(page.getByText("Sample Database", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByText("This question is written in SQL.", { exact: true }),
  ).toHaveCount(0);
  await expect(nativeEditor(page)).toHaveCount(0);
}

/**
 * Port of assertIsQuestion (requires the question-actions popover to be open):
 * the "turn into model" option is present and the raw data source shows.
 */
export async function assertIsQuestion(page: Page) {
  await expect(icon(popover(page), "model")).toBeVisible();
  await expect(page.getByText("Sample Database", { exact: true })).toBeVisible();
}

/**
 * Port of assertQuestionIsBasedOnModel: the QB shows the model + its
 * collection instead of the underlying db/table.
 */
export async function assertQuestionIsBasedOnModel(
  page: Page,
  {
    questionName,
    collection,
    model,
    table,
  }: {
    questionName?: string;
    collection: string;
    model: string;
    table: string;
  },
) {
  // Cypress findByText/findAllByText assert existence, not visibility, and the
  // QB renders hidden duplicates of these labels (e.g. a collapsed breadcrumb),
  // so match the first VISIBLE instance (rule 3's any-of-set semantics).
  if (questionName) {
    await expect(
      page.getByText(questionName, { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible();
  }
  await expect(
    page.getByText(collection, { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText(model, { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("Sample Database", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByText(table, { exact: true })).toHaveCount(0);
}

/**
 * Port of saveQuestionBasedOnModel: open the save modal, optionally rename,
 * and save. Anchors on the POST /api/card the save fires (the Cypress helper
 * registered an `@createCard` intercept for the same reason).
 */
export async function saveQuestionBasedOnModel(
  page: Page,
  { name }: { name?: string } = {},
) {
  const created = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/card",
  );

  await page
    .getByTestId("qb-header")
    .getByRole("button", { name: "Save", exact: true })
    .click();

  const saveModal = page.getByTestId("save-question-modal");
  await expect(
    saveModal.getByText(/Replace original question/i),
  ).toHaveCount(0);
  if (name) {
    const nameInput = saveModal.getByLabel("Name", { exact: true });
    await nameInput.fill(name);
  }
  await saveModal.getByRole("button", { name: "Save", exact: true }).click();
  await created;
}

/**
 * Port of selectDimensionOptionFromSidebar: click a dimension-list row by name
 * (cy `.contains()` is a case-sensitive substring first-match).
 */
export async function selectDimensionOptionFromSidebar(page: Page, name: string) {
  await page
    .getByTestId("dimension-list-item")
    .filter({ hasText: new RegExp(escapeRegExp(name)) })
    .first()
    .click();
}

/** Port of closeQuestionActions: click the QB header to dismiss the menu. */
export async function closeQuestionActions(page: Page) {
  await page.getByTestId("qb-header").click();
}

// startNewQuestion is now canonical in notebook.ts (the URL-navigation form).
// Re-exported here so this module's consumers keep their import unchanged.
export { startNewQuestion } from "./notebook";

/** Port of getCollectionItemRow: findByText(name).closest("tr"). */
export function getCollectionItemRow(page: Page, name: string): Locator {
  return page
    .getByText(name, { exact: true })
    .locator("xpath=ancestor-or-self::tr[1]");
}

/** Port of getCollectionItemCard: findByText(name).closest("a"). */
export function getCollectionItemCard(page: Page, name: string): Locator {
  return page
    .getByText(name, { exact: true })
    .locator("xpath=ancestor-or-self::a[1]");
}

/** Port of getResults: cy.findAllByTestId("result-item"). */
export function getResults(scope: Page | Locator): Locator {
  return scope.getByTestId("result-item");
}

/** Register a wait for the next GET /api/search* (the `@search` alias). */
export function waitForSearch(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === "/api/search",
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
