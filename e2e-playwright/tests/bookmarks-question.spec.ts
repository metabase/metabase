/**
 * Playwright port of e2e/test/scenarios/organization/bookmarks-question.cy.spec.js
 *
 * Snowplow assertions are real, backed by the per-slot collector via
 * ../support/snowplow; the UI flows in those tests are ported for real too.
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
import {
  enableTracking,
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  resetSnowplow,
} from "../support/snowplow";
import { ORDERS_QUESTION_ID } from "../support/sample-data";
import {
  navigationSidebar,
  openNavigationSidebar,
  sidebarSection,
  visitQuestion,
} from "../support/ui";

test.describe("scenarios > question > bookmarks", () => {
  test.beforeEach(async ({ mb }) => {
    await resetSnowplow(mb);
    await mb.restore();
    await mb.signInAsAdmin();
    await enableTracking(mb);
  });

  test.afterEach(async ({ mb }) => {
    await expectNoBadSnowplowEvents(mb);
  });

  test("should add, update bookmark name when question name is updated, then remove bookmark from question page", async ({
    page,
    mb,
  }) => {
    await visitQuestion(page, ORDERS_QUESTION_ID);
    await toggleQuestionBookmarkStatus(page);

    await expectUnstructuredSnowplowEvent(mb, {
      event: "bookmark_added",
      event_detail: "question",
      triggered_from: "qb_action_panel",
    });

    await openNavigationSidebar(page);
    await expect(getSidebarSectionTitle(page, /Bookmarks/)).toBeVisible();
    await expect(
      navigationSidebar(page).getByText("Orders", { exact: true }),
    ).toBeVisible();

    // Rename bookmarked question. Clicking the title swaps in a focused
    // textbox whose accessible name ("Add title") comes from its
    // placeholder — getByLabel can't match that; role+name can.
    await page.getByTestId("saved-question-header-title").click();
    const titleInput = page.getByRole("textbox", { name: "Add title" });
    // Editing state can lag the click under CPU contention (CI parallel
    // legs) — confirm the textbox actually has the value before typing.
    await expect(titleInput).toHaveValue("Orders");
    await titleInput.press("End");
    await titleInput.pressSequentially(" 2");
    // Anchor the rename on its PUT — blur alone can race the re-render.
    const renamed = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        /^\/api\/card\/\d+$/.test(new URL(response.url()).pathname),
    );
    await titleInput.blur();
    await renamed;

    // The rename re-render can collapse the navbar at any moment after blur
    // (even after a successful re-open) — retry the whole open+assert unit
    // until the collapse has landed and been healed.
    await expect(async () => {
      await openNavigationSidebar(page);
      await expect(
        navigationSidebar(page).getByText("Orders 2", { exact: true }),
      ).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 15_000 });

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
      mb,
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

  test("should bookmark a model", async ({ page, mb }) => {
    await visitModel(page, ORDERS_MODEL_ID);

    await toggleQuestionBookmarkStatus(page);
    await expectUnstructuredSnowplowEvent(mb, {
      event: "bookmark_added",
      event_detail: "model",
      triggered_from: "qb_action_panel",
    });

    // Remove the bookmark and expect the number of events to stay the same
    await toggleQuestionBookmarkStatus(page, { wasSelected: true });
    await expectUnstructuredSnowplowEvent(
      mb,
      {
        event: "bookmark_added",
        event_detail: "model",
        triggered_from: "qb_action_panel",
      },
      1,
    );
  });
});
