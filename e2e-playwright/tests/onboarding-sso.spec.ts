/**
 * Playwright port of e2e/test/scenarios/onboarding/auth/sso.cy.spec.js
 *
 * Porting notes:
 * - `H.mockCurrentUserProperty("sso_source", auth)` is the existing
 *   `stubCurrentUser` (support/user-settings.ts): fetch the real
 *   /api/user/current and merge the property in. Registered before page.goto.
 * - The inner `describe("OSS")` is a plain describe name, NOT a Cypress `@OSS`
 *   tag — it means "no premium token active", which is exactly the state after
 *   `mb.restore()`. It therefore runs unconditionally on the EE jar (no gate).
 *   Only the `describe("EE")` block, which calls activateToken, is gated on
 *   MB_PRO_SELF_HOSTED_TOKEN (PORTING rule 7).
 * - `cy.get("iframe")` carries Cypress's implicit existence assertion (the
 *   Google Identity Services script mounts the sign-in button inside an
 *   iframe), so it ports to `toBeAttached()`, not `toBeVisible()` — the GSI
 *   iframes are zero-sized/hidden.
 * - `cy.contains("did not match stored password")` is a case-sensitive
 *   substring match → case-sensitive regex (PORTING rule 1).
 * - `fillInAuthForm` is `submitLoginForm` from support/signin.ts: same three
 *   steps (email, password, click "Sign in"). Cypress clicks `findByText("Sign
 *   in")`, which resolves to the submit button's label; the role-based locator
 *   resolves the same control.
 * - Auth-state hygiene on a shared slot: every test mutates google-auth-* and
 *   the EE block disables password login. `mb.restore()` in the outer
 *   beforeEach resets the whole app DB (settings and token included), so a
 *   mid-test failure cannot poison the slot for the next test — but it would
 *   leave the SLOT itself with password login disabled after the last EE test,
 *   so the EE block restores it in an afterEach. Verified with two consecutive
 *   full runs.
 */
import { resolveToken } from "../support/api";
import { expect, test } from "../support/fixtures";
import {
  setupFakeGoogleAuth,
  signInWithEmailLink,
} from "../support/onboarding-sso";
import { USERS } from "../support/sample-data";
import {
  emailInput,
  passwordInput,
  signInButton,
  submitLoginForm,
} from "../support/signin";
import { stubCurrentUser } from "../support/user-settings";

const { admin } = USERS;

test.describe("scenarios > auth > signin > SSO", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    // Set fake Google client ID and enable Google auth
    await setupFakeGoogleAuth(mb.api);
  });

  for (const auth of ["ldap", "google"]) {
    test(`login history tab should be available with sso_source ${auth} (metabase#15558)`, async ({
      page,
    }) => {
      await stubCurrentUser(page, { sso_source: auth });
      await page.goto("/account/profile");
      await expect(
        page.getByText("Login History", { exact: true }),
      ).toBeVisible();
    });
  }

  test.describe("OSS", () => {
    test.beforeEach(async ({ page, mb }) => {
      await mb.signOut();
      await page.goto("/");
    });

    test("should show SSO button", async ({ page }) => {
      await expect(signInWithEmailLink(page)).toBeVisible();

      // Google SSO button is piped through an iframe
      await expect(page.locator("iframe").first()).toBeAttached();
    });

    test("should show login form when directed to sign in with email", async ({
      page,
    }) => {
      await signInWithEmailLink(page).click();
      await expect(emailInput(page)).toBeVisible();
      await expect(passwordInput(page)).toBeVisible();
      await expect(signInButton(page)).toBeDisabled();
      await expect(
        page.getByText("Sign in with Google", { exact: true }),
      ).toBeVisible();
    });

    test("should surface login errors with Google sign in enabled (metabase#16122)", async ({
      page,
    }) => {
      await signInWithEmailLink(page).click();
      await submitLoginForm(page, "foo@bar.test", "123");
      await expect(
        page.getByText(/did not match stored password/).first(),
      ).toBeVisible();
    });

    test("should pass `redirect` search params from Google button screen to email/password screen (metabase#16216)", async ({
      page,
    }) => {
      const loginProtectedURL = "/admin/permissions/data";

      await page.goto(loginProtectedURL);
      await signInWithEmailLink(page).click();
      await submitLoginForm(page, admin.email, admin.password);

      await expect(page).toHaveURL(new RegExp(loginProtectedURL));
    });
  });

  test.describe("EE", () => {
    test.skip(
      !resolveToken("pro-self-hosted"),
      "Requires MB_PRO_SELF_HOSTED_TOKEN and an EE backend",
    );

    test.beforeEach(async ({ mb }) => {
      await mb.api.activateToken("pro-self-hosted");
      // Disable password log-in
      await mb.api.updateSetting("enable-password-login", false);
      await mb.signOut();
    });

    test.afterEach(async ({ mb }) => {
      // Slot hygiene: re-enable password login so a mid-test failure can't
      // leave the shared backend without a password provider.
      await mb.signInAsAdmin();
      await mb.api.updateSetting("enable-password-login", true);
    });

    test("should show the SSO button without an option to use password", async ({
      page,
    }) => {
      await page.goto("/");
      // Google SSO button is piped through an iframe
      await expect(page.locator("iframe").first()).toBeAttached();
      await expect(signInWithEmailLink(page)).toHaveCount(0);
    });
  });
});
