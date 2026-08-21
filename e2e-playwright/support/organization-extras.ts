/**
 * Helpers for the bookmarks-dashboard, bookmarks-reordering and
 * edit-history-metadata spec ports: the remainder of
 * e2e/test/scenarios/organization/helpers/bookmark-helpers.ts
 * (createAndBookmarkQuestion, verifyBookmarksOrder, moveBookmark) plus the
 * cypress_data user display names those specs assert on.
 */
import { expect, type Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { moveDnDKitElement } from "./dashboard-cards";
import { toggleQuestionBookmarkStatus } from "./organization";
import { SAMPLE_DATABASE } from "./sample-data";
import { sidebarSection, visitQuestion } from "./ui";

/**
 * First/last names from e2e/support/cypress_data.js — the harness USERS map
 * (sample-data.ts) only carries credentials.
 */
export const USER_DISPLAY_NAMES = {
  admin: { first_name: "Bobby", last_name: "Tables" },
  normal: { first_name: "Robert", last_name: "Tableton" },
} as const;

/**
 * Port of createAndBookmarkQuestion (bookmark-helpers.ts): API-create a
 * simple Orders question, visit it, then bookmark it through the UI.
 */
export async function createAndBookmarkQuestion(
  page: Page,
  api: MetabaseApi,
  name: string,
) {
  const { id } = await api.createQuestion({
    name,
    display: "table",
    query: { "source-table": SAMPLE_DATABASE.ORDERS_ID },
  });
  await visitQuestion(page, id);
  await toggleQuestionBookmarkStatus(page);
}

/**
 * Port of verifyBookmarksOrder: the Cypress helper asserted the list length
 * and that each <li> contains its expected name. toContainText(array) alone
 * only checks a subsequence, so pair it with an exact count.
 */
export async function verifyBookmarksOrder(
  page: Page,
  expectedOrder: string[],
) {
  const items = sidebarSection(page, "Bookmarks").locator("li");
  await expect(items).toHaveCount(expectedOrder.length);
  await expect(items).toContainText(expectedOrder);
}

/**
 * Port of moveBookmark: drag the bookmark by `verticalDistance` pixels and
 * anchor on the PUT /api/bookmark/ordering response the drop fires (any
 * status — the failure test mocks a 500).
 */
export async function moveBookmark(
  page: Page,
  name: string,
  verticalDistance: number,
) {
  const reordered = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname === "/api/bookmark/ordering",
  );
  await moveDnDKitElement(
    sidebarSection(page, "Bookmarks").getByText(name, { exact: true }),
    { vertical: verticalDistance },
  );
  await reordered;
}
