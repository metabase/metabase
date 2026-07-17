/**
 * Playwright port of e2e/test/scenarios/organization/bookmarks-question.cy.spec.js
 *
 * Snowplow helpers are no-op stubs (no snowplow-micro container in the spike
 * harness); the UI flows in those tests are ported for real.
 */
import { modal } from "../support/dashboard";
import { icon } from "../support/dashboard-cards";
import { test, expect } from "../support/fixtures";
import { openQuestionActions, visitModel } from "../support/models";
import {
  ORDERS_MODEL_ID,
  getSidebarSectionTitle,
  toggleQuestionBookmarkStatus,
  undoToastList,
} from "../support/organization";
import { ORDERS_QUESTION_ID } from "../support/sample-data";
import {
  navigationSidebar,
  openNavigationSidebar,
  sidebarSection,
  visitQuestion,
} from "../support/ui";

// TODO: no snowplow-micro container in the spike harness.
const resetSnowplow = async () => {};
const enableTracking = async () => {};
const expectNoBadSnowplowEvents = async () => {};
const expectUnstructuredSnowplowEvent = async (
  _event: unknown,
  _count?: number,
) => {};

test.describe("scenarios > question > bookmarks", () => {
  test.beforeEach(async ({ mb }) => {
    await resetSnowplow();
    await mb.restore();
    await mb.signInAsAdmin();
    await enableTracking();
  });

  test.afterEach(async () => {
    await expectNoBadSnowplowEvents();
  });

  test("should add, update bookmark name when question name is updated, then remove bookmark from question page", async ({
    page,
  }) => {
    await visitQuestion(page, ORDERS_QUESTION_ID);
    await toggleQuestionBookmarkStatus(page);

    await expectUnstructuredSnowplowEvent({
      event: "bookmark_added",
      event_detail: "question",
      triggered_from: "qb_action_panel",
    });

    await openNavigationSidebar(page);
    await expect(getSidebarSectionTitle(page, /Bookmarks/)).toBeVisible();
    await expect(
      navigationSidebar(page).getByText("Orders", { exact: true }),
    ).toBeVisible();

    // Rename bookmarked question. The testid sits on the EditableText root;
    // its textarea holds the value, and blur submits the rename.
    const title = page.getByTestId("saved-question-header-title");
    await title.click();
    const titleInput = title.locator("textarea");
    await titleInput.press("End");
    await titleInput.pressSequentially(" 2");
    await titleInput.blur();

    await expect(
      navigationSidebar(page).getByText("Orders 2", { exact: true }),
    ).toBeVisible();

    // Turn the question into a model
    await openQuestionActions(page, "Turn into a model");
    await modal(page)
      .getByText("Turn this into a model", { exact: true })
      .click();

    const modelToast = undoToastList(page).filter({
      hasText: "This is a model now.",
    });
    await expect(modelToast).toBeVisible();
    // Close this toast as soon as we confirm it exists! It lingers in the UI
    // far too long which is causing flakiness later on when we assert on the
    // next toast (when we turn the model back to the question).
    await icon(modelToast, "close").click();

    await openNavigationSidebar(page);
    await expect(icon(sidebarSection(page, "Bookmarks"), "model")).toBeVisible();

    // Turn the model back into a question
    await openQuestionActions(page, "Turn back to saved question");
    await expect(
      undoToastList(page).filter({ hasText: "This is a question now." }),
    ).toBeVisible();

    await openNavigationSidebar(page);
    // Should not find the model icon on the bookmark anymore
    await expect(icon(sidebarSection(page, "Bookmarks"), "model")).toHaveCount(
      0,
    );

    // Remove bookmark
    await toggleQuestionBookmarkStatus(page, { wasSelected: true });
    await expectUnstructuredSnowplowEvent(
      {
        event: "bookmark_added",
        event_detail: "question",
        triggered_from: "qb_action_panel",
      },
      1,
    );

    await expect(getSidebarSectionTitle(page, /Bookmarks/)).toHaveCount(0);
    await expect(
      navigationSidebar(page).getByText("Orders 2", { exact: true }),
    ).toHaveCount(0);
  });

  test("should bookmark a model", async ({ page }) => {
    await visitModel(page, ORDERS_MODEL_ID);

    await toggleQuestionBookmarkStatus(page);
    await expectUnstructuredSnowplowEvent({
      event: "bookmark_added",
      event_detail: "model",
      triggered_from: "qb_action_panel",
    });

    // Remove the bookmark and expect the number of events to stay the same
    await toggleQuestionBookmarkStatus(page, { wasSelected: true });
    await expectUnstructuredSnowplowEvent(
      {
        event: "bookmark_added",
        event_detail: "model",
        triggered_from: "qb_action_panel",
      },
      1,
    );
  });
});
