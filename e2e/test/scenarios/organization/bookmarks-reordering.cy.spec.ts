import {
  ORDERS_COUNT_QUESTION_ID,
  ORDERS_QUESTION_ID,
} from "e2e/support/cypress_sample_instance_data";
import {
  openNavigationSidebar,
  restore,
  visitQuestion,
} from "e2e/support/helpers";

import {
  createAndBookmarkQuestion,
  moveBookmark,
  toggleQuestionBookmarkStatus,
  verifyBookmarksOrder,
} from "./helpers/bookmark-helpers";

describe("scenarios > nav > bookmarks", () => {
  beforeEach(() => {
    restore();
    cy.intercept("/api/bookmark/card/*").as("toggleBookmark");
    cy.intercept("/api/bookmark/ordering").as("reorderBookmarks");
    cy.signInAsAdmin();
  });

  it("should allow bookmarks to be reordered", () => {
    cy.log("Create three bookmarks");
    ["Question 1", "Question 2", "Question 3"].forEach(
      createAndBookmarkQuestion,
    );
    openNavigationSidebar();
    verifyBookmarksOrder(["Question 3", "Question 2", "Question 1"]);
    moveBookmark("Question 1", -100);
    verifyBookmarksOrder(["Question 1", "Question 3", "Question 2"]);
    moveBookmark("Question 3", 100);
    verifyBookmarksOrder(["Question 1", "Question 2", "Question 3"]);
  });

  it("should restore bookmarks order if PUT fails", () => {
    cy.intercept(
      { method: "PUT", url: "/api/bookmark/ordering" },
      { statusCode: 500 },
    ).as("failedToReorderBookmarks");
    cy.log("Create two bookmarks");
    visitQuestion(ORDERS_QUESTION_ID);
    toggleQuestionBookmarkStatus();
    visitQuestion(ORDERS_COUNT_QUESTION_ID);
    toggleQuestionBookmarkStatus();
    openNavigationSidebar();
    const initialOrder = ["Orders, Count", "Orders"];
    verifyBookmarksOrder(initialOrder);
    moveBookmark("Orders, Count", 100, {
      putAlias: "failedToReorderBookmarks",
    });
    verifyBookmarksOrder(initialOrder);
  });
});
