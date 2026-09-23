/**
 * Login-form helpers for the signin spec — the only spec that drives the real
 * `/auth/login` form rather than injecting a cached session cookie. Lives in
 * its own module so the shared support files stay untouched.
 */
import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

/** The email field. `findByLabelText("Email address")` → exact (PORTING rule 1). */
export function emailInput(page: Page): Locator {
  return page.getByLabel("Email address", { exact: true });
}

/** The password field. `findByLabelText("Password")` → exact. */
export function passwordInput(page: Page): Locator {
  return page.getByLabel("Password", { exact: true });
}

/** Port of `cy.button("Sign in")` — findByRole button, exact name. */
export function signInButton(page: Page): Locator {
  return page.getByRole("button", { name: "Sign in", exact: true });
}

/** The "Remember me" checkbox (`cy.findByRole("checkbox")`). */
export function rememberMeCheckbox(page: Page): Locator {
  return page.getByRole("checkbox");
}

/** Fill the real login form and submit. */
export async function submitLoginForm(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await emailInput(page).fill(email);
  await passwordInput(page).fill(password);
  await signInButton(page).click();
}

/**
 * Click an auth-page link (by exact name) and wait for the URL to match.
 *
 * The auth pages autofocus their email field; the first pointerdown on any
 * other control blurs it, which renders a "required" validation error that
 * reflows the page ~10px between mousedown and mouseup. Playwright's real mouse
 * then drops its mouseup/click off the shifted anchor and the navigation never
 * fires (Cypress's synthetic click dispatches every event on the resolved
 * element, so it is immune — it masks the instability). Retrying is self-
 * healing: by the second click the error has already rendered and the link is
 * stable. See findings-inbox/signin.md.
 */
export async function clickAuthLinkExpectUrl(
  page: Page,
  name: string,
  url: RegExp,
): Promise<void> {
  await expect(async () => {
    await page.getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(url, { timeout: 1500 });
  }).toPass();
}
