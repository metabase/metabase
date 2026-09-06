/**
 * Playwright port of
 * e2e/test/scenarios/onboarding/navbar/new-menu.cy.spec.js
 *
 * The app-bar "+ New" menu: opening its entries navigates the query builder.
 * beforeEach opens the menu (support/new-menu.ts openNewMenu). Cypress
 * `findByText` string args are exact matches (PORTING rule 1); `cy.url(...)`
 * checks were retried, so they become expect.poll (PORTING gotcha).
 */
import { test, expect } from "../support/fixtures";
import { nativeEditor } from "../support/native-editor";
import { openNewMenu } from "../support/new-menu";
import { popover } from "../support/ui";

test.describe("scenarios > navbar > new menu", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();

    await openNewMenu(page);
  });

  test("question item opens question notebook editor", async ({ page }) => {
    await popover(page).getByText("Question", { exact: true }).click();

    await expect.poll(() => page.url()).toContain("/question/notebook#");
  });

  test("question item opens SQL query editor", async ({ page }) => {
    await popover(page).getByText("SQL query", { exact: true }).click();

    await expect.poll(() => page.url()).toContain("/question#");
    await expect(nativeEditor(page)).toBeVisible();
  });
});
