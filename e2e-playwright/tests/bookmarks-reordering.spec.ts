/**
 * Playwright port of e2e/test/scenarios/organization/bookmarks-reordering.cy.spec.ts
 *
 * The Cypress beforeEach intercepts ("@toggleBookmark", "@reorderBookmarks")
 * are waited on inside the helpers, so here the response waits live in
 * toggleQuestionBookmarkStatus / moveBookmark, registered at the true
 * trigger.
 */
import { test } from "../support/fixtures";
import {
  ORDERS_COUNT_QUESTION_ID,
  toggleQuestionBookmarkStatus,
} from "../support/organization";
import {
  createAndBookmarkQuestion,
  moveBookmark,
  verifyBookmarksOrder,
} from "../support/organization-extras";
import { ORDERS_QUESTION_ID } from "../support/sample-data";
import { openNavigationSidebar, visitQuestion } from "../support/ui";

test.describe("scenarios > nav > bookmarks", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should allow bookmarks to be reordered", async ({ page, mb }) => {
    // Create three bookmarks
    for (const name of ["Question 1", "Question 2", "Question 3"]) {
      await createAndBookmarkQuestion(page, mb.api, name);
    }
    await openNavigationSidebar(page);
    await verifyBookmarksOrder(page, ["Question 3", "Question 2", "Question 1"]);
    await moveBookmark(page, "Question 1", -100);
    await verifyBookmarksOrder(page, ["Question 1", "Question 3", "Question 2"]);
    await moveBookmark(page, "Question 3", 100);
    await verifyBookmarksOrder(page, ["Question 1", "Question 2", "Question 3"]);
  });

  test("should restore bookmarks order if PUT fails", async ({ page, mb }) => {
    await page.route("**/api/bookmark/ordering", (route) =>
      route.request().method() === "PUT"
        ? route.fulfill({
            status: 500,
            contentType: "application/json",
            body: "{}",
          })
        : route.fallback(),
    );
    // Create two bookmarks
    await visitQuestion(page, ORDERS_QUESTION_ID);
    await toggleQuestionBookmarkStatus(page);
    await visitQuestion(page, ORDERS_COUNT_QUESTION_ID);
    await toggleQuestionBookmarkStatus(page);
    await openNavigationSidebar(page);
    const initialOrder = ["Orders, Count", "Orders"];
    await verifyBookmarksOrder(page, initialOrder);
    await moveBookmark(page, "Orders, Count", 100);
    await verifyBookmarksOrder(page, initialOrder);
  });
});
