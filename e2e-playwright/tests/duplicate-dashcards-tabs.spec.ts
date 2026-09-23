/**
 * Port of e2e/test/scenarios/dashboard-cards/duplicate-dashcards-tabs.cy.spec.js.
 *
 * Notes on the port:
 * - Snowplow assertions run against the per-slot collector (support/snowplow).
 * - The beforeEach's `cy.request("PUT", ...)` that attaches the mapped dashcard
 *   is ported to a direct api.put; dashboardId is stashed per test.
 */
import { expect, test } from "../support/fixtures";
import { editDashboard, filterWidget, getDashboardCard, saveDashboard } from "../support/dashboard";
import { duplicateTab } from "../support/dashboard-core";
import { dashboardCards } from "../support/dashboard-tabs";
import {
  DASHBOARD_CREATE_INFO,
  EVENTS,
  MAPPED_QUESTION_CREATE_INFO,
  createMappedDashcard,
} from "../support/duplicate-dashcards-tabs";
import {
  enableTracking,
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  resetSnowplow,
} from "../support/snowplow";
import { createDashboard, createQuestion } from "../support/factories";
import { popover } from "../support/ui";
import { visitDashboard } from "../support/ui";

test.describe("scenarios > dashboard cards > duplicate", () => {
  let dashboardId: number;

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await resetSnowplow(mb);
    await mb.signInAsAdmin();
    await enableTracking(mb);

    const mappedQuestion = await createQuestion(mb.api, MAPPED_QUESTION_CREATE_INFO);
    const dashboard = await createDashboard(mb.api, DASHBOARD_CREATE_INFO);
    await mb.api.put(`/api/dashboard/${dashboard.id}`, {
      dashcards: [createMappedDashcard(mappedQuestion.id)],
    });
    dashboardId = dashboard.id;
  });

  test.afterEach(async ({ mb }) => {
    await expectNoBadSnowplowEvents(mb);
  });

  test("should allow the user to duplicate a dashcard", async ({ page, mb }) => {
    // 1. Confirm duplication works
    await visitDashboard(page, mb.api, dashboardId);
    await editDashboard(page);

    const card = getDashboardCard(page, 0);
    await card.hover();
    await card.getByLabel("Duplicate", { exact: true }).click();
    await expectUnstructuredSnowplowEvent(mb, EVENTS.duplicateDashcard);

    // check that the new card loads _before_ saving
    await expect(page.getByText("Products", { exact: true })).toHaveCount(2);
    // Also confirm with the card content (VIZ-289)
    await expect(page.getByText("Small Marble Shoes", { exact: true })).toHaveCount(2);

    await saveDashboard(page);
    await expectUnstructuredSnowplowEvent(mb, EVENTS.saveDashboard);

    // 2. Confirm filter still works
    await filterWidget(page).click();
    await popover(page).getByText("Gadget", { exact: true }).click();
    await popover(page).getByRole("button", { name: "Add filter" }).click();

    await expect(page.getByText("Incredible Bronze Pants", { exact: true })).toHaveCount(2);
  });

  test("should allow the user to duplicate a tab", async ({ page, mb }) => {
    // 1. Confirm duplication works
    await visitDashboard(page, mb.api, dashboardId);
    await editDashboard(page);

    await duplicateTab(page, "Tab 1");
    await expectUnstructuredSnowplowEvent(mb, EVENTS.duplicateTab);

    const card = getDashboardCard(page);
    await expect(card.getByText("Products", { exact: true })).toBeVisible();
    await expect(card.getByText("Category", { exact: true })).toBeVisible();
    await expect(card.getByText(/(Problem|Error)/i)).toHaveCount(0);

    await saveDashboard(page);
    await expectUnstructuredSnowplowEvent(mb, EVENTS.saveDashboard);

    await expect(dashboardCards(page).getByText("Products", { exact: true })).toBeVisible();

    // 2. Confirm filter still works
    await filterWidget(page).click();
    await popover(page).getByText("Gadget", { exact: true }).click();
    await popover(page).getByRole("button", { name: "Add filter" }).click();

    await expect(
      dashboardCards(page).getByText("Incredible Bronze Pants", { exact: true }),
    ).toBeVisible();
  });
});
