/**
 * Playwright port of e2e/test/scenarios/organization/bookmarks-dashboard.cy.spec.js
 *
 * Snowplow assertions are real, backed by the per-slot collector via
 * ../support/snowplow; the UI flow those events decorate is ported for real too.
 */
import { dashboardHeader } from "../support/dashboard";
import { icon } from "../support/dashboard-cards";
import { test, expect } from "../support/fixtures";
import {
  enableTracking,
  expectUnstructuredSnowplowEvent,
  resetSnowplow,
} from "../support/snowplow";
import { ORDERS_DASHBOARD_ID } from "../support/sample-data";
import {
  navigationSidebar,
  openNavigationSidebar,
  visitDashboard,
} from "../support/ui";

test.describe("scenarios > dashboard > bookmarks", () => {
  test.beforeEach(async ({ mb }) => {
    await resetSnowplow(mb);
    await mb.restore();
    await mb.signInAsAdmin();
    await enableTracking(mb);
  });

  test("should add, update bookmark name when dashboard name is updated, and then remove bookmark", async ({
    page,
    mb,
  }) => {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await openNavigationSidebar(page);

    // Add bookmark
    await icon(dashboardHeader(page), "bookmark").click();
    await expectUnstructuredSnowplowEvent(mb, {
      event: "bookmark_added",
      event_detail: "dashboard",
      triggered_from: "dashboard_header",
    });

    await expect(
      navigationSidebar(page).getByText("Orders in a dashboard", {
        exact: true,
      }),
    ).toBeVisible();

    // Rename bookmarked dashboard. The title is an EditableText textarea
    // (data-testid lands on the textarea itself) — fill() doesn't mark it
    // dirty, so click + pressSequentially, and anchor the rename on its PUT.
    const titleInput = page.getByTestId("dashboard-name-heading");
    await titleInput.click();
    await expect(titleInput).toHaveValue("Orders in a dashboard");
    await titleInput.press("End");
    await titleInput.pressSequentially(" 2");
    const renamed = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        /^\/api\/dashboard\/\d+$/.test(new URL(response.url()).pathname),
    );
    await titleInput.blur();
    await renamed;

    // The rename re-render can collapse the navbar at any moment after blur
    // (same gotcha as the question rename in bookmarks-question) — retry the
    // whole open+assert unit until the collapse has landed and been healed.
    await expect(async () => {
      await openNavigationSidebar(page);
      await expect(
        navigationSidebar(page).getByText("Orders in a dashboard 2", {
          exact: true,
        }),
      ).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 15_000 });

    // Remove bookmark
    await icon(dashboardHeader(page), "bookmark_filled").click();
    // Removing a bookmark should not be tracked
    await expectUnstructuredSnowplowEvent(
      mb,
      {
        event: "bookmark_added",
        event_detail: "dashboard",
        triggered_from: "dashboard_header",
      },
      1,
    );
    await expect(
      navigationSidebar(page).getByText("Orders in a dashboard 2", {
        exact: true,
      }),
    ).toHaveCount(0);
  });
});
