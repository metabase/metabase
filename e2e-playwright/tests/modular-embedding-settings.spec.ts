import { expect, test } from "../support/fixtures";
import { main } from "../support/ui";

/**
 * Port of e2e/test/scenarios/embedding/modular-embedding-settings.cy.spec.ts
 *
 * TIER. Tagged `@EE` upstream and activates `pro-self-hosted`. The gate is
 * REAL and was measured, not assumed: the "Tenants" row in
 * `RelatedSettingsSection` is rendered only when `isTenantsFeatureAvailable`
 * (`getRelatedSettingItems`, constants.ts), and `/admin/embedding/modular` is
 * itself an EE-plugin route. With the token removed the row does not exist and
 * both tests fail at `getByText("Tenants")`. Since `mb.restore()` clears the
 * token on this EE jar, `activateToken("pro-self-hosted")` is the whole gate —
 * there is nothing to `test.skip`, both tests execute.
 *
 * Port notes:
 * - `.closest("a")` has no Playwright equivalent; `xpath=ancestor::a[1]` is the
 *   exact same "nearest enclosing anchor" walk.
 * - `.scrollIntoView()` → `scrollIntoViewIfNeeded()`. Kept because upstream's
 *   very next assertion is `should("be.visible")`, which for Cypress means
 *   in-viewport-ish; Playwright's `toBeVisible()` does not require the
 *   viewport, so the scroll is the faithful half of that pair and the
 *   visibility assertion is kept alongside it.
 * - `findByText("Tenants")` is an EXACT match (rule 1) and testing-library
 *   throws on multiple matches, so `{ exact: true }` under `main` is unique.
 */

const TENANTS_ROW = (page: Parameters<typeof main>[0]) =>
  main(page).getByText("Tenants", { exact: true });

test.describe("scenarios > modular embedding settings", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test("should link to user strategy when tenants are disabled", async ({
    page,
  }) => {
    await page.goto("/admin/embedding/modular");

    const tenants = TENANTS_ROW(page);
    await tenants.scrollIntoViewIfNeeded();
    await expect(tenants).toBeVisible();

    await expect(tenants.locator("xpath=ancestor::a[1]")).toHaveAttribute(
      "href",
      "/admin/people/user-strategy",
    );
  });

  test("should link to tenants page when tenants are enabled", async ({
    page,
    mb,
  }) => {
    await mb.api.updateSetting("use-tenants", true);

    await page.goto("/admin/embedding/modular");

    const tenants = TENANTS_ROW(page);
    await tenants.scrollIntoViewIfNeeded();
    await expect(tenants).toBeVisible();

    await expect(tenants.locator("xpath=ancestor::a[1]")).toHaveAttribute(
      "href",
      "/admin/people/tenants",
    );
  });
});
