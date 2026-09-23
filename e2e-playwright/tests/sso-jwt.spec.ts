/**
 * Playwright port of e2e/test/scenarios/admin-2/sso/jwt.cy.spec.js
 *
 * Porting notes:
 * - JWT SSO is a premium feature, so the whole describe is gated on the
 *   pro-self-hosted token (PORTING rule 7) — the Cypress beforeEach calls
 *   H.activateToken("pro-self-hosted") unconditionally.
 * - The two `cy.intercept(...).as()` aliases become `page.waitForResponse`
 *   predicates registered before the triggering action (PORTING rule 2):
 *     updateSettings → PUT /api/setting        (bulk, exact pathname)
 *     updateSetting  → PUT /api/setting/<key>  (single, pathname prefix)
 *   The inner "Group Mappings Widget" describe registers four more aliases
 *   (@getSettings, @getSessionProperties, @deleteGroup, @clearGroup); those are
 *   awaited inside the shared group-mappings driver, which already ports them.
 * - getJwtCard() is `getByTestId("jwt-setting")`: upstream's
 *   findByText("JWT").parent().parent() resolves to exactly that CardRoot.
 * - `enableJwtAuth` is the existing port of e2e-jwt-helpers.ts in
 *   support/sdk-iframe.ts; the group-mappings driver is the existing port of
 *   shared/group-mappings-widget.js in support/sso-saml.ts, parameterised by
 *   auth method exactly like the original. Neither is re-implemented here.
 * - Auth-state hygiene: every test mutates jwt-* settings and the mapping tests
 *   delete permission groups, but `mb.restore()` in beforeEach resets the whole
 *   app DB (settings included), so a mid-test failure cannot poison the slot.
 *   Verified by two consecutive full runs.
 */
import { resolveToken } from "../support/api";
import { expect, test } from "../support/fixtures";
import { undoToast } from "../support/metrics";
import { enableJwtAuth } from "../support/sdk-iframe";
import {
  getJwtCard,
  waitForUpdateSetting,
  waitForUpdateSettings,
} from "../support/sso-jwt";
import {
  checkGroupConsistencyAfterDeletingMappings,
  crudGroupMappingsWidget,
  goToAuthOverviewPage,
  typeAndBlurUsingLabel,
} from "../support/sso-saml";
import { icon, modal, popover } from "../support/ui";

test.describe("scenarios > admin > settings > SSO > JWT", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "JWT SSO is premium — requires MB_PRO_SELF_HOSTED_TOKEN and an EE backend",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test("should allow to save and enable jwt", async ({ page }) => {
    await page.goto("/admin/settings/authentication/jwt");

    await typeAndBlurUsingLabel(
      page,
      /JWT Identity Provider URI/i,
      "https://example.test",
    );
    await page.getByRole("button", { name: "Set up key", exact: true }).click();
    // The modal generates the key asynchronously (SetupKeyModal useMount →
    // /api/util/random_token) and Done stays disabled until it lands.
    const doneButton = modal(page).getByRole("button", {
      name: "Done",
      exact: true,
    });
    await expect(doneButton).toBeEnabled();
    await doneButton.click();

    const saved = waitForUpdateSettings(page);
    await page
      .getByRole("button", { name: "Save and enable", exact: true })
      .click();
    await saved;

    await goToAuthOverviewPage(page);

    await expect(
      getJwtCard(page).getByText("Active", { exact: true }),
    ).toBeVisible();
  });

  test("should allow to disable and enable jwt", async ({ page, mb }) => {
    await enableJwtAuth(mb);
    await page.goto("/admin/settings/authentication");

    await icon(getJwtCard(page), "ellipsis").click();
    let updated = waitForUpdateSetting(page);
    await popover(page).getByText("Pause", { exact: true }).click();
    await updated;
    await expect(
      getJwtCard(page).getByText("Paused", { exact: true }),
    ).toBeVisible();

    await icon(getJwtCard(page), "ellipsis").click();
    updated = waitForUpdateSetting(page);
    await popover(page).getByText("Resume", { exact: true }).click();
    await updated;
    await expect(
      getJwtCard(page).getByText("Active", { exact: true }),
    ).toBeVisible();
  });

  test("should allow the user to enable/disable user provisioning", async ({
    page,
    mb,
  }) => {
    await enableJwtAuth(mb);
    await page.goto("/admin/settings/authentication/jwt");

    const setting = page.getByTestId("jwt-user-provisioning-enabled?-setting");
    const updated = waitForUpdateSetting(page);
    await setting.getByText(/^Disabled/).click();
    await updated;

    await expect(
      undoToast(page).getByText("Changes saved", { exact: true }),
    ).toBeVisible();
  });

  test("should allow to reset jwt settings", async ({ page, mb }) => {
    await enableJwtAuth(mb);
    await page.goto("/admin/settings/authentication");

    await icon(getJwtCard(page), "ellipsis").click();
    await popover(page).getByText("Deactivate", { exact: true }).click();
    const saved = waitForUpdateSettings(page);
    await modal(page)
      .getByRole("button", { name: "Deactivate", exact: true })
      .click();
    await saved;

    await expect(
      getJwtCard(page).getByText("Set up", { exact: true }),
    ).toBeVisible();
  });

  test("should allow to regenerate the jwt key and save the settings", async ({
    page,
    mb,
  }) => {
    await enableJwtAuth(mb);
    await page.goto("/admin/settings/authentication/jwt");

    // enableJwtAuth sets the shared secret to "0".repeat(64); FormSecretKey
    // renders it obfuscated as "**********" + the last two characters.
    await expect(
      page.getByLabel(/String used by the JWT signing key/i),
    ).toHaveValue("**********00");

    await page
      .getByRole("button", { name: "Regenerate key", exact: true })
      .click();
    const setupKeyModal = modal(page);
    await expect(
      setupKeyModal.getByText("Set up secret key", { exact: true }),
    ).toBeVisible();
    await expect(
      setupKeyModal.getByText(
        "This will cause existing tokens to stop working until the identity provider is updated with the new key.",
        { exact: true },
      ),
    ).toBeVisible();
    const doneButton = setupKeyModal.getByRole("button", {
      name: "Done",
      exact: true,
    });
    await expect(doneButton).toBeEnabled();
    await doneButton.click();

    const saved = waitForUpdateSettings(page);
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await saved;

    await expect(
      page.getByTestId("admin-layout-content").getByText("Success", {
        exact: true,
      }),
    ).toBeVisible();
  });

  test.describe("Group Mappings Widget", () => {
    test("should allow deleting mappings along with deleting, or clearing users of, mapped groups", async ({
      page,
    }) => {
      await crudGroupMappingsWidget(page, "jwt");
    });

    test("should allow deleting mappings with groups, while keeping remaining mappings consistent with their undeleted groups", async ({
      page,
    }) => {
      await checkGroupConsistencyAfterDeletingMappings(page, "jwt");
    });
  });
});
