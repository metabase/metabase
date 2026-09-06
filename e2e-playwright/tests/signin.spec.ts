/**
 * Playwright port of e2e/test/scenarios/onboarding/auth/signin.cy.spec.js
 *
 * The only spec that drives the real /auth/login form. Each test starts signed
 * out: beforeEach restores and clears the session cookie (mb.signOut). Tests
 * that need an authenticated starting point call mb.signInAsAdmin() (cached
 * cookie) before navigating.
 *
 * Notes:
 * - findByLabelText / cy.button strings → exact matches (PORTING rule 1); login
 *   form locators live in support/signin.ts.
 * - cy.intercept("POST","/api/dataset") → waitForResponse registered before the
 *   triggering action (rule 2). Only the redirect-after-login test awaits it.
 * - cy.url().should("contain"/"not.contain") → expect(page).toHaveURL / not.
 * - The error alert is filtered by its message text, matching the Cypress
 *   `.filter(':contains(...)')`.
 * - The forgot_password redirect (metabase#12658) clicks auth-page links via
 *   clickAuthLinkExpectUrl: the first click blurs the autofocused email field,
 *   whose "required" validation error reflows the link mid-click so the real
 *   mouse's mouseup misses it (Cypress's synthetic click is immune). The
 *   retry is self-healing. See findings-inbox/signin.md.
 */
import { browseDatabases } from "../support/question-settings";
import { getProfileLink } from "../support/command-palette";
import { expect, test } from "../support/fixtures";
import { USERS } from "../support/sample-data";
import {
  clickAuthLinkExpectUrl,
  emailInput,
  rememberMeCheckbox,
  submitLoginForm,
} from "../support/signin";

const { admin } = USERS;

const sizes: Array<[number, number]> = [
  [1280, 800],
  [640, 360],
];

test.describe("scenarios > auth > signin", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signOut();
  });

  test("should redirect to /auth/login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/auth\/login/);
  });

  test("should redirect to / when logged in", async ({ page, mb }) => {
    await mb.signInAsAdmin();
    await page.goto("/auth/login");
    await expect(page).not.toHaveURL(/auth\/login/);
    await expect(getProfileLink(page)).toBeVisible();
  });

  test("should display an error for incorrect passwords", async ({ page }) => {
    await page.goto("/");
    await submitLoginForm(page, admin.email, "INVALID" + admin.password);
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "did not match stored password" }),
    ).toBeVisible();
  });

  test("should display same error for unknown users (to avoid leaking the existence of accounts)", async ({
    page,
  }) => {
    await page.goto("/");
    await submitLoginForm(page, "INVALID" + admin.email, admin.password);
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "did not match stored password" }),
    ).toBeVisible();
  });

  test("should greet users after successful login", async ({ page }) => {
    await page.goto("/auth/login");
    await expect(emailInput(page)).toBeFocused();
    await submitLoginForm(page, admin.email, admin.password);
    await expect(page.getByTestId("greeting-message")).toContainText("Bobby");
  });

  test("should allow login regardless of login email case", async ({ page }) => {
    await page.goto("/auth/login");
    await submitLoginForm(page, admin.email.toUpperCase(), admin.password);
    await expect(page.getByTestId("greeting-message")).toContainText("Bobby");
  });

  test("should allow toggling of Remember Me", async ({ page }) => {
    await page.goto("/auth/login");

    // default initial state
    await expect(rememberMeCheckbox(page)).toBeChecked();

    await page.getByLabel("Remember me").click();
    await expect(rememberMeCheckbox(page)).not.toBeChecked();
  });

  test("should redirect to an unsaved question after login", async ({
    page,
    mb,
  }) => {
    await mb.signInAsAdmin();
    await page.goto("/");
    await browseDatabases(page).click();
    await page
      .getByRole("heading", { name: "Sample Database", exact: true })
      .click();

    const firstDataset = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/dataset" &&
        r.request().method() === "POST",
    );
    await page.getByRole("heading", { name: "Orders", exact: true }).click();
    await firstDataset;
    await expect(
      page.getByRole("gridcell", { name: "37.65", exact: true }).first(),
    ).toBeVisible();

    // signout and reload page with question hash in url
    await mb.signOut();
    await page.reload();

    await expect(
      page.getByRole("heading", { name: "Sign in to Metabase", exact: true }),
    ).toBeVisible();

    const secondDataset = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/dataset" &&
        r.request().method() === "POST",
    );
    await submitLoginForm(page, admin.email, admin.password);
    await secondDataset;
    await expect(
      page.getByRole("gridcell", { name: "37.65", exact: true }).first(),
    ).toBeVisible();
  });

  for (const size of sizes) {
    test(`should redirect from /auth/forgot_password back to /auth/login (viewport: ${size}) (metabase#12658)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: size[0], height: size[1] });

      await page.goto("/");
      await expect(page).toHaveURL(/auth\/login/);
      await clickAuthLinkExpectUrl(
        page,
        "I seem to have forgotten my password",
        /auth\/forgot_password/,
      );
      await clickAuthLinkExpectUrl(page, "Back to sign in", /auth\/login/);
    });
  }
});
