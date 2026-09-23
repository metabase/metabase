/**
 * Helpers for the multi-factor-auth spec (admin-2/multi-factor-auth). Lives in
 * its own module so the shared support files stay untouched.
 *
 * Ports the spec-local helpers of
 * e2e/test/scenarios/admin-2/multi-factor-auth.cy.spec.ts:
 * mfaSetting / mfaToggle / enableMfa / enrollNormalUser / enrollViaUI /
 * signInWithPassword / getResetLink / generateTotpCode.
 */
import { expect } from "@playwright/test";
import type { Locator, Page, Response } from "@playwright/test";
import * as OTPAuth from "otpauth";

import type { MetabaseApi } from "./api";
import { USERS } from "./sample-data";
import { modal } from "./ui";

const { normal } = USERS;

/**
 * The subset of the `mb` fixture these helpers need. The harness class itself
 * is not exported from fixtures.ts, so type it structurally.
 */
type MbLike = {
  api: MetabaseApi;
  signInAsNormalUser: () => Promise<void>;
  signOut: () => Promise<void>;
};

// === locators ===

/** Port of the spec-local mfaSetting(). */
export function mfaSetting(page: Page): Locator {
  return page.getByTestId("mfa-setting");
}

/**
 * Port of the spec-local mfaToggle() — `findByLabelText(/Enabled|Disabled/)`.
 * The Mantine Switch renders `role="switch"` on a visually-hidden input, so it
 * is clicked with `{ force: true }` (PORTING rule 4).
 */
export function mfaToggle(page: Page): Locator {
  return mfaSetting(page).getByLabel(/Enabled|Disabled/);
}

/** The auth page shell (`cy.findByTestId("login-page")`). */
export function loginPage(page: Page): Locator {
  return page.getByTestId("login-page");
}

/** `findByLabelText("Authenticator code")` → exact (PORTING rule 1). */
export function authenticatorCodeInput(page: Page): Locator {
  return page.getByLabel("Authenticator code", { exact: true });
}

/** `findByLabelText("Recovery code")` → exact. */
export function recoveryCodeInput(page: Page): Locator {
  return page.getByLabel("Recovery code", { exact: true });
}

/**
 * `findByLabelText("Confirm with an authenticator code or a recovery code")`
 * — the ConfirmCodeForm input shared by the disable and regenerate modals.
 */
export function confirmCodeInput(scope: Page | Locator): Locator {
  return scope.getByLabel(
    "Confirm with an authenticator code or a recovery code",
    { exact: true },
  );
}

/**
 * Port of `cy.button(name)` — findByRole("button", { name }), exact for
 * strings (PORTING rule 1); a regex is passed through unchanged.
 */
export function button(scope: Page | Locator, name: string | RegExp): Locator {
  return scope.getByRole("button", {
    name,
    exact: typeof name === "string" ? true : undefined,
  });
}

// === response waits (PORTING rule 2: register before the trigger) ===

const waitFor = (page: Page, method: string, pathname: string) =>
  page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === pathname &&
      response.request().method() === method,
  );

/** Port of `cy.intercept("PUT", "/api/setting/mfa-enforcement")`. */
export const waitForEnforcement = (page: Page): Promise<Response> =>
  waitFor(page, "PUT", "/api/setting/mfa-enforcement");

/** Port of `cy.intercept("POST", "/api/ee/mfa/enroll")`. */
export const waitForEnroll = (page: Page): Promise<Response> =>
  waitFor(page, "POST", "/api/ee/mfa/enroll");

/** Port of `cy.intercept("POST", "/api/ee/mfa/recovery-codes")`. */
export const waitForRecoveryCodes = (page: Page): Promise<Response> =>
  waitFor(page, "POST", "/api/ee/mfa/recovery-codes");

// === API helpers ===

/** Port of the spec-local enableMfa(). Requires an admin session. */
export async function enableMfa(api: MetabaseApi): Promise<void> {
  await api.put("/api/setting/mfa-enforcement", { value: "optional" });
}

/**
 * Port of the spec-local enrollNormalUser(): sign in as the normal user and
 * enroll them entirely through the API, returning the TOTP secret and the
 * recovery codes.
 */
export async function enrollNormalUser(
  mb: MbLike,
): Promise<{ secret: string; recoveryCodes: string[] }> {
  await mb.signInAsNormalUser();
  const enrollResponse = await mb.api.post("/api/ee/mfa/enroll", {
    password: normal.password,
  });
  const { secret } = (await enrollResponse.json()) as { secret: string };
  const confirmResponse = await mb.api.post("/api/ee/mfa/enroll/confirm", {
    code: generateTotpCode(secret, Date.now() / 1000),
  });
  const { recovery_codes: recoveryCodes } = (await confirmResponse.json()) as {
    recovery_codes: string[];
  };
  return { secret, recoveryCodes };
}

// === UI flows ===

/**
 * Click one of the challenge form's `AuthTextButton`s ("Use a recovery code
 * instead", "Email me a code") and wait for what it switches to.
 *
 * These sit inside the same `<Form>` as the autofocused code input, so the
 * first pointerdown blurs that input, Formik marks it touched, and a
 * "required" alert renders *between* mousedown and mouseup — the button moves
 * ~20px and Playwright's real mouse drops the click. (Cypress dispatches the
 * whole sequence at the already-resolved element and never sees this; it is
 * the same reflow class as support/signin.ts clickAuthLinkExpectUrl.)
 *
 * Retrying is safe because the gate is the button's own *name*: once the
 * toggle lands, the button relabels ("Use an authenticator code instead" /
 * "Resend code"), so the exact-name locator stops matching and we never
 * toggle back.
 */
export async function clickAuthTextButton(
  page: Page,
  name: string,
  expected: Locator,
): Promise<void> {
  const control = loginPage(page).getByRole("button", { name, exact: true });
  await expect(async () => {
    if (await control.isVisible()) {
      await control.click();
    }
    await expect(expected).toBeVisible({ timeout: 2_000 });
  }).toPass();
}

/**
 * Port of the spec-local enrollViaUI(): drive the whole setup modal from the
 * account-security panel and return the TOTP secret the backend handed out.
 */
export async function enrollViaUI(page: Page): Promise<string> {
  await button(page, "Set up two-factor authentication").click();
  const dialog = modal(page);
  await dialog
    .getByLabel("Confirm your password to begin", { exact: true })
    .fill(normal.password);

  const enroll = waitForEnroll(page);
  await button(dialog, "Continue").click();
  const { secret } = (await (await enroll).json()) as { secret: string };

  await dialog
    .getByLabel("Enter the 6-digit code from the authenticator app", {
      exact: true,
    })
    .fill(generateTotpCode(secret, Date.now() / 1000));
  await button(dialog, "Set up authentication").click();
  await expect(
    dialog.getByText("Your recovery codes", { exact: true }),
  ).toBeVisible();
  await button(dialog, "Done").click();
  return secret;
}

/**
 * Port of the spec-local signInWithPassword(): sign out, then log the normal
 * user in through the real form so the second-factor challenge is exercised.
 */
export async function signInWithPassword(
  page: Page,
  mb: MbLike,
): Promise<void> {
  await mb.signOut();
  await page.goto("/auth/login");
  await page.getByLabel("Email address", { exact: true }).fill(normal.email);
  await page.getByLabel("Password", { exact: true }).fill(normal.password);
  await button(page, "Sign in").click();
}

// === pure helpers ===

/** Port of the spec-local getResetLink(): the href of the email's first anchor. */
export function getResetLink(html: string): string {
  const [, anchor] = html.match(/<a (.*)>/) ?? [];
  const [, href] = String(anchor).match(/href="([^"]+)"/) ?? [];
  return String(href);
}

/**
 * Port of the spec-local generateTotpCode(). SHA1 / 6 digits / 30s, matching
 * metabase-enterprise.mfa.totp.
 *
 * Callers that need a code the backend has not already consumed pass
 * `Date.now() / 1000 + 30` — enrollment records the accepted time step and
 * rejects anything at or before it (replay protection), while validation
 * accepts ±1 step of skew, so the *next* window is both fresh and in range.
 */
export function generateTotpCode(secret: string, unixSeconds: number): string {
  return new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(secret),
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  }).generate({ timestamp: unixSeconds * 1000 });
}
