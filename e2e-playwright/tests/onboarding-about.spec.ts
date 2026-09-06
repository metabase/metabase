/**
 * Playwright port of e2e/test/scenarios/onboarding/about.cy.spec.js
 *
 * The file's only test is tagged @skip upstream, so it is declared with the
 * static test.skip(title, fn) form — unlike an in-body skip, this keeps the
 * beforeEach (restore + UI navigation) from running for nothing.
 */
import { modal } from "../support/dashboard";
import { icon } from "../support/dashboard-cards";
import { test, expect } from "../support/fixtures";
import { popover } from "../support/ui";

test.describe("scenarios > about Metabase", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await page.goto("/");
    await icon(page, "gear").click();
    await popover(page).getByText("About Metabase", { exact: true }).click();
  });

  // @skip upstream in Cypress
  test.skip("should display correct Metabase version (metabase#15656)", async ({
    page,
  }) => {
    const aboutModal = modal(page);
    await expect(
      aboutModal.getByText(/You're on version v[01](\.\d+){2,3}(-[\w\d]+)?/i),
    ).toBeVisible();
    await expect(
      aboutModal.getByText(/Built on \d{4}-\d{2}-\d{2}/),
    ).toBeVisible();
    await expect(aboutModal.getByText("Branch: ?", { exact: true })).toHaveCount(
      0,
    );
    await expect(aboutModal.getByText("Hash: ?", { exact: true })).toHaveCount(
      0,
    );
  });
});
