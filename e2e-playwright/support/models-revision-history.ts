/**
 * Helpers for the models-revision-history spec port (models-revision-history.cy.spec.js).
 *
 * The spec-local `openRevisionHistory` / `revertTo` here are the QUESTION/MODEL
 * variants (question-info button + `saved-question-history-list` +
 * `question-revert-button`), distinct from the dashboard-flavoured
 * openRevisionHistory / clickRevert already in support/revisions.ts.
 *
 * sidesheet / questionInfoButton and the revert-response waits are imported
 * read-only from support/revisions.ts; ORDERS_BY_YEAR_QUESTION_ID mirrors the
 * Cypress import from cypress_sample_instance_data (as several other support
 * modules already do it locally).
 */
import type { Page } from "@playwright/test";

import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";

import { expect } from "./fixtures";
import {
  expectRevertSuccess,
  questionInfoButton,
  sidesheet,
  waitForRevert,
} from "./revisions";

function findQuestionId(name: string): number {
  const question = SAMPLE_INSTANCE_DATA.questions.find(
    (question) => question.name === name,
  );
  if (!question) {
    throw new Error(`No question named "${name}" in sample instance data`);
  }
  return question.id;
}

/** Port of ORDERS_BY_YEAR_QUESTION_ID (cypress_sample_instance_data.js). */
export const ORDERS_BY_YEAR_QUESTION_ID = findQuestionId(
  "Orders, Count, Grouped by Created At (year)",
);

/**
 * Port of the spec-local openRevisionHistory: open the question-info sidesheet,
 * switch to the History tab, and wait for the revision list to render.
 */
export async function openRevisionHistory(page: Page) {
  await questionInfoButton(page).click();
  await sidesheet(page)
    .getByRole("tab", { name: "History", exact: true })
    .click();
  await expect(page.getByTestId("saved-question-history-list")).toBeVisible();
}

/**
 * Port of the spec-local revertTo(history): find the revision-history-event
 * whose text matches `history` (Cypress built `new RegExp(history)`, a
 * case-sensitive substring), then click its revert button. The revert POST is
 * anchored so the follow-up navigation/location assertion is deterministic.
 */
export async function revertTo(page: Page, history: string) {
  const revert = waitForRevert(page);
  await page
    .getByTestId("revision-history-event")
    .filter({ hasText: new RegExp(history) })
    .getByTestId("question-revert-button")
    .click();
  await expectRevertSuccess(revert);
}
