/**
 * Helpers for the forgot-password port
 * (e2e/test/scenarios/onboarding/auth/forgot_password.cy.spec.js).
 *
 * New file so the shared support modules stay untouched (porting rule 9).
 * `setupSMTP` / `getInbox` / `waitForEmail` / `emailAddressees` /
 * `isMaildevRunning` are reused read-only from support/onboarding-extras.ts.
 *
 * The one non-obvious piece here is `waitForOwnResetEmail`: the maildev inbox
 * is a single container shared by every slot, and `setupSMTP` DELETEs it, so
 * neither a message count nor "the first email in the inbox" is safe to key
 * on. See the comment on that function.
 */
import type { Locator, Page } from "@playwright/test";

import {
  type MaildevEmail,
  emailAddressees,
  getInbox,
  waitForEmail,
} from "./onboarding-extras";

// === /auth/forgot_password locators ===

/**
 * `findByLabelText("Email address")` → exact (PORTING rule 1). The input is a
 * `FormTextInput name="email"` inside ForgotPasswordForm and is autoFocused.
 */
export function emailAddressInput(page: Page): Locator {
  return page.getByLabel("Email address", { exact: true });
}

/**
 * `findByText("Send password reset email")` → exact (PORTING rule 1).
 *
 * Deliberately `getByText`, not `getByRole("button")`: upstream uses
 * `findByText`, and the control is a `FormSubmitButton` whose label swaps to
 * "Success"/"Failed" by status, so the text *is* the thing under test.
 */
export function sendResetEmailButton(page: Page): Locator {
  return page.getByText("Send password reset email", { exact: true });
}

/**
 * The ForgotPasswordSuccess message. Upstream is a bare
 * `cy.findByText(/If the email exists/)` — no `.should()`, but `findByText`
 * throws when nothing matches, so it is an existence assertion and is ported
 * as `toBeVisible()`.
 *
 * Regex rather than a string because the source template literal carries a
 * leading space (`t\` If the email exists, …\``).
 */
export function resetEmailSentMessage(page: Page): Locator {
  return page.getByText(/If the email exists/);
}

/** `ForgotPasswordForm`'s `PasswordFormTitle`. Positive anchor for the
 * app-bar absence assertion — proves the auth page actually rendered. */
export function forgotPasswordTitle(page: Page): Locator {
  return page.getByText("Forgot password", { exact: true });
}

// === /auth/reset_password/:token locators ===

/** `findByLabelText("Create a password")` → exact (PORTING rule 1). */
export function createPasswordInput(page: Page): Locator {
  return page.getByLabel("Create a password", { exact: true });
}

/** `findByLabelText("Confirm your password")` → exact (PORTING rule 1). */
export function confirmPasswordInput(page: Page): Locator {
  return page.getByLabel("Confirm your password", { exact: true });
}

/** `findByText("Save new password")` → exact (PORTING rule 1). */
export function saveNewPasswordButton(page: Page): Locator {
  return page.getByText("Save new password", { exact: true });
}

/**
 * `findByText("You've updated your password.")` → exact (PORTING rule 1).
 * This is a **toast** (`sendToast` in ResetPassword.tsx), not inline copy, so
 * it renders in the undo-list on `/` after the post-reset redirect.
 */
export function passwordUpdatedToast(page: Page): Locator {
  return page.getByText("You've updated your password.", { exact: true });
}

// === pure helpers ===

/**
 * Port of the spec-local `getResetLink()`: the href of the email's first
 * anchor. Byte-for-byte the same extraction as upstream (first `<a …>`, then
 * its `href="…"`), with the destructures made null-safe for TS.
 *
 * Deliberately re-ported here rather than imported from
 * support/multi-factor-auth.ts, which has an identical copy: it is a
 * *spec-local* helper in both Cypress originals, so each port owns one.
 */
export function getResetLink(html: string): string {
  const [, anchor] = html.match(/<a (.*)>/) ?? [];
  const [, href] = String(anchor).match(/href="([^"]+)"/) ?? [];
  return String(href);
}

// === shared-inbox isolation ===

/** The ids currently in the shared inbox — snapshot this immediately before
 * the action that sends the email under test. */
export async function inboxIds(): Promise<Set<string>> {
  return new Set((await getInbox()).map((email) => email.id));
}

/**
 * Wait for *this slot's* password-reset email.
 *
 * Upstream reads `H.getInbox().then(({ body: [{ html }] }) => …)` — i.e. it
 * takes inbox entry 0 and trusts that `setupSMTP`'s DELETE left exactly one
 * message there. That was not true when every parallel slot shared the single
 * maildev on :1080 — siblings delivered into it mid-run and their `setupSMTP`
 * DELETEd our messages, so entry 0 could be someone else's mail. Each slot now
 * has its own maildev (support/maildev.ts), which removes that class of
 * failure, but the four conjuncts below stay: they are strictly stronger than
 * `[0]`, and they are the only defence left when isolation is OFF and the
 * shared container really is shared.
 *
 * The port matches on four conjuncts, of which the third is the decisive one:
 *
 *  1. `id` not in the pre-send snapshot — excludes anything already sitting
 *     in the inbox when we clicked.
 *  2. subject contains "Password Reset Request" — the subject
 *     `send-password-reset-email!` builds (channel/email/messages.clj).
 *  3. **the body links at our own site URL.** `forgot-password-impl`
 *     (session/api.clj) builds the link as
 *     `(system/site-url) + "/auth/reset_password/" + token`, and `MB_SITE_URL`
 *     is pinned per slot by support/worker-backend.ts. So a reset mail from
 *     slot N carries `http://localhost:410N` and cannot be mistaken for ours.
 *  4. recipient is the address we asked for.
 *
 * Conjunct 3 is what makes this genuinely slot-safe; 1, 2 and 4 are cheap
 * belt-and-braces. Polling (rather than one-shot) is required regardless:
 * `forgot-password-impl` wraps the whole send in a `future`, so the mail
 * lands after the API response.
 */
export async function waitForOwnResetEmail({
  recipient,
  siteUrl,
  excludeIds,
}: {
  recipient: string;
  siteUrl: string;
  excludeIds: Set<string>;
}): Promise<MaildevEmail> {
  return waitForEmail(
    (email) =>
      !excludeIds.has(email.id) &&
      email.subject.includes("Password Reset Request") &&
      String(email.html).includes(`${siteUrl}/auth/reset_password/`) &&
      emailAddressees(email).includes(recipient),
  );
}
