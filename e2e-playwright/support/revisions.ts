/**
 * Revision-history helpers for the revision-history spec port: ports of
 * H.sidesheet / H.questionInfoButton (e2e-ui-elements-helpers.js),
 * H.openQuestionsSidebar and H.saveDashboard({ awaitRequest: false })
 * (e2e-dashboard-helpers.ts), plus the spec-local openRevisionHistory /
 * clickRevert functions from revision-history.cy.spec.js.
 */
import { expect } from "@playwright/test";
import type { Locator, Page, Response } from "@playwright/test";

import { dashboardHeader, editBar, waitForDashcardsToLoad } from "./dashboard";

export function sidesheet(page: Page): Locator {
  return page.getByTestId("sidesheet");
}

export function questionInfoButton(page: Page): Locator {
  return page.getByTestId("qb-header-info-button");
}

/** Port of H.openQuestionsSidebar. */
export async function openQuestionsSidebar(page: Page) {
  await dashboardHeader(page)
    .getByLabel("Add questions", { exact: true })
    .click();
}

/**
 * Port of H.saveDashboard({ awaitRequest: false }): the shared
 * dashboard.saveDashboard always awaits the PUT + query_metadata responses,
 * but a no-diff save may not fire them, so this variant only waits on the UI
 * signals (edit bar gone, dashcards loaded).
 */
export async function saveDashboardWithoutAwaitingRequests(page: Page) {
  await expect(editBar(page)).toBeVisible();
  await editBar(page).getByTestId("save-edit-button").click();
  await expect(editBar(page)).not.toBeVisible();
  await waitForDashcardsToLoad(page);
}

/**
 * Port of the spec-local openRevisionHistory: open the dashboard info
 * sidesheet, switch to the History tab, and wait for the revision list. The
 * GET /api/revision wait is registered before the clicks that trigger it.
 */
export async function openRevisionHistory(page: Page) {
  const revisionHistory = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/revision",
  );

  const moreInfoButton = dashboardHeader(page).getByLabel("More info", {
    exact: true,
  });
  await expect(moreInfoButton).toBeVisible();
  await moreInfoButton.click();

  const sheet = sidesheet(page);
  const historyTab = sheet.getByRole("tab", { name: "History", exact: true });
  await historyTab.click();
  await revisionHistory;

  await expect(historyTab).toHaveAttribute("aria-selected", "true");
  await expect(sheet.getByTestId("dashboard-history-list")).toBeVisible();
}

/**
 * Port of the spec-local clickRevert. The revert buttons carry the event
 * description as their accessible name (`aria-label="revert to ${title}"` in
 * RevisionHistoryTimeline), which is what the Cypress findAllByLabelText
 * matched.
 */
export async function clickRevert(
  page: Page,
  eventName: RegExp,
  index = 0,
) {
  await page.getByLabel(eventName).nth(index).click();
}

/**
 * Playwright equivalent of the spec's cy.intercept("POST",
 * "/api/revision/revert").as("revert"): register BEFORE the click that
 * triggers the revert, then pass the promise to expectRevertSuccess.
 */
export function waitForRevert(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/revision/revert",
  );
}

/** Port of the repeated cy.wait("@revert") status/cause assertions. */
export async function expectRevertSuccess(revert: Promise<Response>) {
  const response = await revert;
  expect(response.status()).toBe(200);
  const body: { cause?: unknown } = await response.json();
  expect(body.cause).toBeUndefined();
}
