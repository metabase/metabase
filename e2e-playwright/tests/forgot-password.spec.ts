/**
 * Playwright port of e2e/test/scenarios/onboarding/auth/forgot_password.cy.spec.js
 *
 * **Filename note:** the Cypress source is `forgot_password.cy.spec.js`
 * (underscore); the port is `forgot-password.spec.ts` (hyphen). That is
 * deliberate — the Playwright suite is uniformly hyphen-cased. The *route* the
 * tests visit keeps the underscore (`/auth/forgot_password`), because that is
 * the real product URL.
 *
 * Spec-local helpers live in support/forgot-password.ts. The maildev helpers
 * (setupSMTP / waitForEmail / isMaildevRunning / emailAddressees) are reused
 * read-only from support/onboarding-extras.ts.
 *
 * Notes on the port:
 * - Upstream's `describe` carries `{ tags: "@external" }`, which in this repo
 *   means "needs a service outside the app" — here the maildev container
 *   (SMTP :1025, web :1080), pulled in by `H.setupSMTP()` in the beforeEach.
 *   Ported as a `test.skip(!(await isMaildevRunning()))` in the beforeEach,
 *   the same gate onboarding/documents/multi-factor-auth use. beforeEach is
 *   safe here rather than describe level because the describe has **no
 *   afterEach** to strand.
 * - `findByText` / `findByLabelText` with string arguments are exact matches
 *   (PORTING rule 1). `findByText(/regex/)` stays a regex.
 * - A bare `cy.findByText(...)` with no `.should()` is still an existence
 *   assertion (testing-library throws on no match), so both are ported as
 *   `toBeVisible()`.
 * - 🔴 The shared-inbox problem: upstream takes inbox entry 0 and assumes
 *   `setupSMTP`'s DELETE left only its own mail there. The maildev container
 *   is shared across every parallel slot, so that is false in this harness.
 *   `waitForOwnResetEmail` keys on our own per-slot `MB_SITE_URL` appearing in
 *   the reset link — see the long comment on it in support/forgot-password.ts.
 * - "You've updated your password." is a **toast**, not inline copy
 *   (`sendToast` in ResetPassword.tsx), so it appears on `/` after the
 *   post-reset redirect rather than on the reset page.
 * - 🔴 `cy.icon("gear").should("not.exist")` is VACUOUS on this build —
 *   `.Icon-gear` matches nothing anywhere, so it cannot fail. Kept verbatim
 *   per the porting rule, with a declared strengthening next to it that
 *   asserts the app bar is actually absent.
 * - The password the test sets is the admin's *existing* password, so the
 *   whole flow is idempotent and `--repeat-each` safe even before `restore()`.
 *   That is upstream's choice, kept as-is.
 *
 * See findings-inbox/forgot-password.md.
 */
import { expect, test } from "../support/fixtures";
import {
  confirmPasswordInput,
  createPasswordInput,
  emailAddressInput,
  forgotPasswordTitle,
  getResetLink,
  inboxIds,
  passwordUpdatedToast,
  resetEmailSentMessage,
  saveNewPasswordButton,
  sendResetEmailButton,
  waitForOwnResetEmail,
} from "../support/forgot-password";
import { isMaildevRunning, setupSMTP } from "../support/onboarding-extras";
import { USERS } from "../support/sample-data";
import { appBar, icon } from "../support/ui";

const { admin } = USERS;

test.describe("scenarios > auth > password", () => {
  test.beforeEach(async ({ mb }) => {
    test.skip(!(await isMaildevRunning()), "maildev container is not running");
    await mb.restore();
    await mb.signInAsAdmin();
    await setupSMTP(mb.api);
    await mb.signOut();
  });

  test("should reset password via email", async ({ page, baseURL }) => {
    await page.goto("/auth/forgot_password");

    await emailAddressInput(page).fill(admin.email);

    // Snapshot the shared inbox *before* the send, so a sibling slot's mail
    // that is already sitting there can never be picked up as ours.
    const preexisting = await inboxIds();

    await sendResetEmailButton(page).click();
    await expect(resetEmailSentMessage(page)).toBeVisible();

    const resetEmail = await waitForOwnResetEmail({
      recipient: admin.email,
      siteUrl: String(baseURL),
      excludeIds: preexisting,
    });

    await page.goto(getResetLink(String(resetEmail.html)));

    await createPasswordInput(page).fill(admin.password);
    await confirmPasswordInput(page).fill(admin.password);
    await saveNewPasswordButton(page).click();

    await expect(passwordUpdatedToast(page)).toBeVisible();
  });

  test("should not show the app bar when previously logged in", async ({
    page,
    mb,
  }) => {
    await mb.signInAsAdmin();

    await page.goto("/auth/forgot_password");

    // Positive anchor first: a zero-assertion passes on its first poll, so
    // without proof that the forgot-password page rendered, `not.exist` would
    // also hold on a blank or still-loading document. (The form view only
    // renders at all because beforeEach configured SMTP — without it
    // ForgotPassword.tsx falls back to ForgotPasswordDisabled, which has no
    // title and no email input.)
    await expect(forgotPasswordTitle(page)).toBeVisible();
    await expect(emailAddressInput(page)).toBeVisible();

    // Upstream's assertion, kept verbatim — but it is VACUOUS on this build.
    // `.Icon-gear` matches zero elements *anywhere*, including `/` while
    // signed in as admin, so it can never fail. Measured: the admin app bar
    // renders Icon-burger / Icon-search / Icon-add / Icon-metabot / … and the
    // settings entry point is labelled "Settings" without a `gear` icon
    // class. See findings-inbox/forgot-password.md.
    await expect(icon(page, "gear")).toHaveCount(0);

    // STRENGTHENING (declared): the above cannot fail, so it does not test
    // the behaviour the test is named for. This asserts the app bar itself is
    // absent. Presence-probed as a real discriminator: `getByLabel(
    // "Navigation bar")` is 1 on `/` and 0 here.
    await expect(appBar(page)).toHaveCount(0);
  });
});
