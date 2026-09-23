/**
 * Playwright port of e2e/test/scenarios/admin-2/multi-factor-auth.cy.spec.ts
 *
 * Notes on the port:
 * - Spec-local helpers live in support/multi-factor-auth.ts (mfaSetting,
 *   mfaToggle, enableMfa, enrollNormalUser, enrollViaUI, signInWithPassword,
 *   getResetLink, generateTotpCode).
 * - `cy.intercept(...).as()` + `cy.wait("@...")` → `waitForResponse` predicates
 *   registered before the triggering action (PORTING rule 2). The three
 *   intercepts are registered per-use rather than in beforeEach.
 * - `findByText`/`findByLabelText`/`cy.button` with string arguments are exact
 *   matches (rule 1).
 * - The Mantine Switch is clicked on its `role="switch"` input with
 *   `{ force: true }` (rule 4), and asserted enabled first — `useAdminSetting`
 *   keeps it disabled while loading and a force-click on a disabled input
 *   silently no-ops.
 * - TOTP: no mock clock is involved anywhere (no `cy.clock`, no
 *   `/api/testing/set-time`), so the port needs no clock handling. Codes are
 *   generated for `Date.now()/1000 + 30` wherever the backend has already
 *   consumed the current time step — see generateTotpCode's comment.
 *   `mb.restore()` POSTs /api/testing/reset-throttlers, which resets the MFA
 *   throttlers too (testing_api/api.clj), so repeated bad codes across tests
 *   cannot lock the user out.
 * - The two email tests need the maildev container
 *   (`docker run -d -p 1080:1080 -p 1025:1025 maildev/maildev:2.0.5`, or
 *   `npx maildev -s 1025 -w 1080`) and skip without it, the same gate
 *   onboarding/documents use. `clearInbox()` in beforeEach is likewise
 *   conditional — upstream runs it unconditionally, but its only purpose is to
 *   isolate the email assertions, so gating it keeps the other six tests
 *   runnable on a box with no maildev.
 * - Upstream reads the sign-in-code / password-reset emails with
 *   `H.getInbox()`, which resolves as soon as the inbox is non-empty. Both
 *   flows have an enrollment notification already sitting in the inbox, so
 *   that resolves before the email under test has necessarily been sent (the
 *   backend sends on a background thread) and the following `to.exist` is a
 *   race. Ported as `waitForEmail(subject match)`, which asserts the same
 *   thing without the race. See findings-inbox/multi-factor-auth.md.
 */
import { expect, test } from "../support/fixtures";
import { deleteToken } from "../support/admin-extras";
import {
  clearInbox,
  isMaildevRunning,
  setupSMTP,
  waitForEmail,
} from "../support/onboarding-extras";
import {
  authenticatorCodeInput,
  button,
  clickAuthTextButton,
  confirmCodeInput,
  enableMfa,
  enrollNormalUser,
  enrollViaUI,
  generateTotpCode,
  getResetLink,
  loginPage,
  mfaSetting,
  mfaToggle,
  recoveryCodeInput,
  signInWithPassword,
  waitForEnforcement,
  waitForRecoveryCodes,
} from "../support/multi-factor-auth";
import { USERS } from "../support/sample-data";
import { NORMAL_USER_ID } from "../support/user-settings";
import { modal } from "../support/ui";

const { normal } = USERS;

const NEW_PASSWORD = "NewPassword2fa!123";

test.describe("scenarios > admin > settings > multi-factor authentication", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    if (await isMaildevRunning()) {
      await clearInbox();
    }
    await mb.signInAsAdmin();
    await mb.api.activateToken("bleeding-edge");
  });

  test("admin can enable and disable 2FA in authentication settings", async ({
    page,
  }) => {
    await page.goto("/admin/settings/authentication");
    await mfaSetting(page).scrollIntoViewIfNeeded();
    await expect(
      mfaSetting(page).getByText("Two-factor authentication", { exact: true }),
    ).toBeVisible();

    await expect(mfaToggle(page)).not.toBeChecked();
    await expect(mfaToggle(page)).toBeEnabled();
    const enabling = waitForEnforcement(page);
    await mfaToggle(page).click({ force: true });
    await enabling;
    await expect(mfaSetting(page)).toContainText("0 enrolled users");
    await expect(mfaSetting(page)).toContainText("users without 2FA");

    // Disable it again
    await expect(mfaToggle(page)).toBeChecked();
    const disabling = waitForEnforcement(page);
    await mfaToggle(page).click({ force: true });
    await disabling;
    await expect(mfaToggle(page)).not.toBeChecked();
    await expect(mfaSetting(page)).not.toContainText("enrolled");
  });

  test("user can set up 2FA in account settings and sign in with an authenticator code", async ({
    page,
    mb,
  }) => {
    await enableMfa(mb.api);

    // User enrolls from account security settings
    await mb.signInAsNormalUser();
    await page.goto("/account/security");
    await expect(
      page
        .getByTestId("account-header")
        .getByRole("tab", { name: "Security", exact: true }),
    ).toBeVisible();
    const totpSecret = await enrollViaUI(page);
    await expect(button(page, "Disable")).toBeVisible();
    await expect(button(page, "Generate recovery codes")).toBeVisible();

    // Signing in now requires an authenticator code
    await signInWithPassword(page, mb);
    await expect(
      loginPage(page).getByText(
        "Enter the 6-digit code from your authenticator app.",
        { exact: true },
      ),
    ).toBeVisible();
    // The backend rejects a reused TOTP time step, so take the code for the
    // next 30-second window — validation accepts one step of clock skew.
    await authenticatorCodeInput(page).fill(
      generateTotpCode(totpSecret, Date.now() / 1000 + 30),
    );
    await button(page, "Verify").click();
    await expect(page.getByTestId("greeting-message")).toBeVisible();
  });

  test("user can disable 2FA themselves and re-enroll", async ({ page, mb }) => {
    await enableMfa(mb.api);
    const { secret } = await enrollNormalUser(mb);

    // Disabling requires a fresh second factor, not just a password
    await page.goto("/account/security");
    await button(page, "Disable").click();
    const dialog = modal(page);
    await expect(
      dialog.getByText(
        "Are you sure you want to disable two-factor authentication? Your account will be protected by your password only, and your recovery codes will stop working.",
        { exact: true },
      ),
    ).toBeVisible();
    await confirmCodeInput(dialog).fill(
      generateTotpCode(secret, Date.now() / 1000 + 30),
    );
    await button(dialog, "Disable").click();

    await expect(
      button(page, "Set up two-factor authentication"),
    ).toBeEnabled();

    // Re-enroll from scratch with a new secret
    await enrollViaUI(page);
    await expect(button(page, "Disable")).toBeVisible();
  });

  test("recovery codes sign the user in once and regeneration invalidates the old set", async ({
    page,
    mb,
  }) => {
    await enableMfa(mb.api);
    const { secret, recoveryCodes } = await enrollNormalUser(mb);

    // Sign in with a recovery code instead of an authenticator code
    await signInWithPassword(page, mb);
    await clickAuthTextButton(
      page,
      "Use a recovery code instead",
      recoveryCodeInput(page),
    );
    await recoveryCodeInput(page).fill(recoveryCodes[0]);
    await button(page, "Verify").click();
    await expect(page.getByTestId("greeting-message")).toBeVisible();

    // Regenerate the recovery codes
    await page.goto("/account/security");
    await button(page, "Generate recovery codes").click();
    const dialog = modal(page);
    await expect(
      dialog.getByText(
        "This will generate a new set of recovery codes and invalidate all of your old ones.",
        { exact: true },
      ),
    ).toBeVisible();
    await confirmCodeInput(dialog).fill(
      generateTotpCode(secret, Date.now() / 1000 + 30),
    );
    const regenerate = waitForRecoveryCodes(page);
    await button(dialog, "Generate new codes").click();
    const { recovery_codes: newCodes } = (await (
      await regenerate
    ).json()) as { recovery_codes: string[] };
    await expect(
      dialog.getByText("Your recovery codes", { exact: true }),
    ).toBeVisible();
    await button(dialog, "Done").click();

    // Old codes no longer work; new ones do
    await signInWithPassword(page, mb);
    await clickAuthTextButton(
      page,
      "Use a recovery code instead",
      recoveryCodeInput(page),
    );
    await recoveryCodeInput(page).fill(recoveryCodes[1]);
    await button(page, "Verify").click();
    await expect(loginPage(page).getByRole("alert")).toContainText(
      "Invalid authentication code.",
    );
    await recoveryCodeInput(page).fill(newCodes[0]);
    // the submit button transiently reads "Failed" after the rejected
    // attempt but stays clickable, so match either label
    await button(page, /Verify|Failed/).click();
    await expect(page.getByTestId("greeting-message")).toBeVisible();
  });

  test("an emailed one-time code works as a fallback second factor", async ({
    page,
    mb,
  }) => {
    test.skip(!(await isMaildevRunning()), "maildev container is not running");
    await enableMfa(mb.api);
    await setupSMTP(mb.api);
    await enrollNormalUser(mb);

    await signInWithPassword(page, mb);
    await expect(
      loginPage(page).getByText(
        "Enter the 6-digit code from your authenticator app.",
        { exact: true },
      ),
    ).toBeVisible();

    const codeSent = loginPage(page).getByText("Code sent — check your email", {
      exact: true,
    });
    await clickAuthTextButton(page, "Email me a code", codeSent);
    await expect(codeSent).toBeVisible();

    const otpEmail = await waitForEmail((email) =>
      email.subject.includes("Your sign-in code"),
    );
    const code = String(otpEmail.html).match(/>\s*(\d{6})\s*</)?.[1];
    expect(code, "6-digit code in the email body").toEqual(
      expect.stringMatching(/^\d{6}$/),
    );
    await authenticatorCodeInput(page).fill(String(code));
    await button(page, "Verify").click();
    await expect(page.getByTestId("greeting-message")).toBeVisible();
  });

  test("resetting a forgotten password does not bypass the second factor", async ({
    page,
    mb,
  }) => {
    test.skip(!(await isMaildevRunning()), "maildev container is not running");
    await enableMfa(mb.api);
    await setupSMTP(mb.api);
    const { secret } = await enrollNormalUser(mb);

    // Request a reset link and set a new password
    await mb.signOut();
    await page.goto("/auth/forgot_password");
    await page.getByLabel("Email address", { exact: true }).fill(normal.email);
    await button(page, "Send password reset email").click();
    await expect(
      loginPage(page).getByText(/If the email exists/),
    ).toBeVisible();

    // the reset email is sent asynchronously and lands next to the "2FA
    // enabled" notification from enrollment — wait for the one under test
    const resetEmail = await waitForEmail((email) =>
      email.subject.includes("Password Reset"),
    );
    await page.goto(getResetLink(String(resetEmail.html)));
    await page
      .getByLabel("Create a password", { exact: true })
      .fill(NEW_PASSWORD);
    await page
      .getByLabel("Confirm your password", { exact: true })
      .fill(NEW_PASSWORD);
    await button(page, "Save new password").click();

    // No session is minted — the new password still needs a code
    await expect(page).toHaveURL(/\/auth\/login/);
    await page.getByLabel("Email address", { exact: true }).fill(normal.email);
    await page.getByLabel("Password", { exact: true }).fill(NEW_PASSWORD);
    await button(page, "Sign in").click();
    await expect(
      loginPage(page).getByText(
        "Enter the 6-digit code from your authenticator app.",
        { exact: true },
      ),
    ).toBeVisible();
    await authenticatorCodeInput(page).fill(
      generateTotpCode(secret, Date.now() / 1000 + 30),
    );
    await button(page, "Verify").click();
    await expect(page.getByTestId("greeting-message")).toBeVisible();
  });

  test("an enrolled user is still challenged and can disable 2FA after the license lapses", async ({
    page,
    mb,
  }) => {
    await enableMfa(mb.api);
    const { secret, recoveryCodes } = await enrollNormalUser(mb);

    // Drop the premium token — the gate must fail closed
    await mb.signInAsAdmin();
    await deleteToken(mb.api);

    await signInWithPassword(page, mb);
    await expect(
      loginPage(page).getByText(
        "Enter the 6-digit code from your authenticator app.",
        { exact: true },
      ),
    ).toBeVisible();
    await authenticatorCodeInput(page).fill(
      generateTotpCode(secret, Date.now() / 1000 + 30),
    );
    await button(page, "Verify").click();
    await expect(page.getByTestId("greeting-message")).toBeVisible();

    // Managing the existing enrollment still works without a license
    await page.goto("/account/security");
    await button(page, "Disable").click();
    const dialog = modal(page);
    await confirmCodeInput(dialog).fill(recoveryCodes[0]);
    await button(dialog, "Disable").click();

    // Without the feature there is no way back into setup
    await expect(page).toHaveURL(/\/account\/profile/);
    await page.goto("/account/security");
    await expect(
      button(page, "Set up two-factor authentication"),
    ).toBeDisabled();
  });

  test("admin can remove a user's enrollment to unlock them", async ({
    page,
    mb,
  }) => {
    await enableMfa(mb.api);
    await enrollNormalUser(mb);

    // Admin sees the enrollment and removes it (lockout escape hatch)
    await mb.signInAsAdmin();
    await page.goto("/admin/settings/authentication");
    await mfaSetting(page).scrollIntoViewIfNeeded();
    await expect(mfaSetting(page)).toContainText("1 enrolled user");
    await mb.api.post("/api/ee/mfa/admin/remove", { user_id: NORMAL_USER_ID });

    // After the reset the user signs in with just a password
    await signInWithPassword(page, mb);
    await expect(page.getByTestId("greeting-message")).toBeVisible();
    await expect(page).not.toHaveURL(/\/auth\/login/);
  });
});
