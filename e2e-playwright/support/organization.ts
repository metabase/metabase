/**
 * Helpers for the organization spec ports (bookmarks-question,
 * content-verification): ports of
 * e2e/test/scenarios/organization/helpers/bookmark-helpers.ts and the H
 * helpers those specs use, plus the instance-data ids they need.
 */
import type { Locator, Page } from "@playwright/test";

import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";

import { dashboardHeader } from "./dashboard";
import { navigationSidebar, popover } from "./ui";

const findQuestionId = (name: string): number => {
  const question = SAMPLE_INSTANCE_DATA.questions.find(
    (question) => question.name === name,
  );
  if (!question) {
    throw new Error(
      `Question "${name}" not found in cypress_sample_instance_data`,
    );
  }
  return Number(question.id);
};

export const ORDERS_MODEL_ID = findQuestionId("Orders Model");
export const ORDERS_COUNT_QUESTION_ID = findQuestionId("Orders, Count");

/**
 * Port of toggleQuestionBookmarkStatus (bookmark-helpers.ts). The Cypress
 * helper waited on a "@toggleBookmark" intercept registered in beforeEach;
 * here the response wait is registered just before the click that fires it.
 */
export async function toggleQuestionBookmarkStatus(
  page: Page,
  { wasSelected = false }: { wasSelected?: boolean } = {},
) {
  const labelText = wasSelected ? "Remove from bookmarks" : "Bookmark";
  const toggleBookmark = page.waitForResponse((response) =>
    new URL(response.url()).pathname.startsWith("/api/bookmark/card/"),
  );
  await page
    .getByTestId("qb-header-action-panel")
    .getByLabel(labelText, { exact: true })
    .click();
  await toggleBookmark;
}

/**
 * Port of H.getSidebarSectionTitle (e2e-collection-helpers.ts), scoped to the
 * navigation sidebar as the specs always use it inside navigationSidebar().
 */
export function getSidebarSectionTitle(
  page: Page,
  name: string | RegExp,
): Locator {
  return navigationSidebar(page).getByRole("heading", { name });
}

/** Port of H.undoToastList: findAllByTestId("toast-undo"). */
export function undoToastList(page: Page): Locator {
  return page.getByTestId("toast-undo");
}

/** Port of H.openDashboardMenu (e2e-dashboard-helpers.ts). */
export async function openDashboardMenu(page: Page, option?: string) {
  await dashboardHeader(page)
    .getByLabel("Move, trash, and more…", { exact: true })
    .click();
  if (option) {
    await popover(page).getByText(option, { exact: true }).click();
  }
}
