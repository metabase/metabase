/**
 * Playwright port of
 * e2e/test/scenarios/dashboard-cards/dashboard-card-undo.cy.spec.js
 *
 * Undo/redo of dashcard edits: removing a card then undoing restores it (and
 * its grid position, best effort); the same for moving a card to another tab.
 *
 * Port notes:
 * - Every helper is reused from the shared support modules; no new helpers were
 *   needed, so support/dashboard-card-undo.ts is not created.
 * - `H.undo()` → the shared `undo(page)` (dashboard-parameters.ts), which clicks
 *   `undoToast(page).last()` — the newest toast — so a still-animating previous
 *   toast can't trigger a strict-mode violation under CI load.
 * - `checkOrder()` uses `findByText(string)` → exact match (port rule 1).
 * - The upstream `cy.wait(200)` "let the UI catch up before the next hover" is
 *   preserved as `waitForTimeout(200)`.
 */
import { editDashboard, getDashboardCard } from "../support/dashboard";
import {
  createNewTab,
  getDashboardCards,
  getTextCardDetails,
  removeDashboardCard,
  updateDashboardCards,
} from "../support/dashboard-core";
import {
  goToTab,
  moveDashCardToTab,
  undo,
} from "../support/dashboard-parameters";
import { test, expect } from "../support/fixtures";
import { visitDashboard } from "../support/ui";

test.describe("scenarios > dashboard cards > undo", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("when undoing a dashcard removal or dashcard tab movement, it should try to restore the position (best effort)", async ({
    page,
    mb,
  }) => {
    const checkOrder = async () => {
      await expect(
        getDashboardCard(page, 0).getByText("Text card 1", { exact: true }),
      ).toBeVisible();
      await expect(
        getDashboardCard(page, 1).getByText("Text card 2", { exact: true }),
      ).toBeVisible();
      await expect(
        getDashboardCard(page, 2).getByText("Text card 3", { exact: true }),
      ).toBeVisible();
      await expect(
        getDashboardCard(page, 3).getByText("Text card 4", { exact: true }),
      ).toBeVisible();
    };

    const cards = [
      getTextCardDetails({
        text: "Text card 1",
        size_x: 4,
        size_y: 1,
        row: 0,
        col: 1,
      }),
      getTextCardDetails({
        text: "Text card 2",
        size_x: 4,
        size_y: 1,
        row: 1,
        col: 0,
      }),
      getTextCardDetails({
        text: "Text card 3",
        size_x: 4,
        size_y: 1,
        row: 2,
        col: 3,
      }),
      getTextCardDetails({
        text: "Text card 4",
        size_x: 4,
        size_y: 1,
        row: 3,
        col: 0,
      }),
    ];

    const { id: dashboard_id } = await mb.api.createDashboard();
    await updateDashboardCards(mb.api, { dashboard_id, cards });
    await visitDashboard(page, mb.api, dashboard_id);

    await checkOrder();

    await editDashboard(page);

    for (let i = 0; i < cards.length; i++) {
      await removeDashboardCard(page, i);
      await expect(getDashboardCards(page)).toHaveCount(cards.length - 1);

      await undo(page);
      await expect(getDashboardCards(page)).toHaveCount(cards.length);
      await checkOrder();
      // Seems to be needed to allow the UI to catch up before hovering the next
      // element. TODO: improve this.
      await page.waitForTimeout(200);
    }

    await createNewTab(page);
    await goToTab(page, "Tab 1");

    for (let i = 0; i < cards.length; i++) {
      await moveDashCardToTab(page, { dashcardIndex: i, tabName: "Tab 2" });
      await expect(getDashboardCards(page)).toHaveCount(cards.length - 1);

      await undo(page);
      await expect(getDashboardCards(page)).toHaveCount(cards.length);
      await checkOrder();
      await page.waitForTimeout(200);
    }
  });
});
