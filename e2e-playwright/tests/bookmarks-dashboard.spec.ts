/**
 * Playwright port of e2e/test/scenarios/organization/bookmarks-dashboard.cy.spec.js
 *
 * Snowplow helpers are no-op stubs (no snowplow-micro container in the spike
 * harness); the UI flow those events decorate is ported for real.
 */
import { dashboardHeader } from "../support/dashboard";
import { icon } from "../support/dashboard-cards";
import { test, expect } from "../support/fixtures";
import { ORDERS_DASHBOARD_ID } from "../support/sample-data";
import {
  navigationSidebar,
  openNavigationSidebar,
  visitDashboard,
} from "../support/ui";

// TODO: no snowplow-micro container in the spike harness.
const resetSnowplow = async () => {};
const enableTracking = async () => {};
const expectUnstructuredSnowplowEvent = async (
  _event: unknown,
  _count?: number,
) => {};

test.describe("scenarios > dashboard > bookmarks", () => {
  test.beforeEach(async ({ mb }) => {
    await resetSnowplow();
    await mb.restore();
    await mb.signInAsAdmin();
    await enableTracking();
  });

  test("should add, update bookmark name when dashboard name is updated, and then remove bookmark", async ({
    page,
    mb,
  }) => {
    await visitDashboard(page, mb.api, ORDERS_DASHBOARD_ID);
    await openNavigationSidebar(page);

    // Add bookmark
    await icon(dashboardHeader(page), "bookmark").click();
    await expectUnstructuredSnowplowEvent({
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
