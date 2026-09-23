/**
 * Playwright port of e2e/test/scenarios/admin-2/sso/google.cy.spec.js
 *
 * Porting notes:
 * - The three `cy.intercept(...).as()` aliases become `page.waitForResponse`
 *   predicates registered before the triggering click (PORTING rule 2):
 *     updateSettings       → PUT /api/setting        (bulk, exact pathname)
 *     updateSetting        → PUT /api/setting/<key>  (single, pathname prefix)
 *     updateGoogleSettings → PUT /api/google/settings
 * - `cy.findByDisplayValue(value)` on the Client ID field is ported as a
 *   `toHaveValue` on the labelled input (getByDisplayValue is missing from this
 *   install's Playwright types), which is the same assertion in intent.
 * - The client-id / domain values are the dummy fixtures the Cypress spec uses;
 *   no real Google round-trip happens (validation and enable are backend-local).
 */
import type { Page } from "@playwright/test";

import { test, expect } from "../support/fixtures";
import {
  CLIENT_ID_SUFFIX,
  getGoogleCard,
  setupGoogleAuth,
  typeAndBlurUsingLabel,
} from "../support/sso-google";
import { icon, modal, popover } from "../support/ui";

function waitForUpdateGoogleSettings(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname === "/api/google/settings",
  );
}

function waitForUpdateSetting(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname.startsWith("/api/setting/"),
  );
}

function waitForUpdateSettings(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname === "/api/setting",
  );
}

test.describe("scenarios > admin > settings > SSO > Google", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should save the client id on subsequent tries (metabase#15974)", async ({
    page,
  }) => {
    await page.goto("/admin/settings/authentication/google");

    await typeAndBlurUsingLabel(
      page,
      "Client ID",
      `example1.${CLIENT_ID_SUFFIX}`,
    );
    let saved = waitForUpdateGoogleSettings(page);
    await page.getByRole("button", { name: "Save and enable" }).click();
    await saved;

    await page.reload();
    await expect(page.getByLabel("Client ID", { exact: true })).toHaveValue(
      `example1.${CLIENT_ID_SUFFIX}`,
    );

    await typeAndBlurUsingLabel(
      page,
      "Client ID",
      `example2.${CLIENT_ID_SUFFIX}`,
    );
    saved = waitForUpdateGoogleSettings(page);
    await page.getByRole("button", { name: "Save changes" }).click();
    await saved;

    await expect(
      page.getByRole("button", { name: "Success", exact: true }),
    ).toBeVisible();
  });

  test("should allow to disable and enable google auth (metabase#20442)", async ({
    page,
    mb,
  }) => {
    await setupGoogleAuth(mb.api);
    await page.goto("/admin/settings/authentication");

    await icon(getGoogleCard(page), "ellipsis").click();
    let updated = waitForUpdateSetting(page);
    await popover(page).getByText("Pause", { exact: true }).click();
    await updated;
    await expect(
      getGoogleCard(page).getByText("Paused", { exact: true }),
    ).toBeVisible();

    await icon(getGoogleCard(page), "ellipsis").click();
    updated = waitForUpdateSetting(page);
    await popover(page).getByText("Resume", { exact: true }).click();
    await updated;
    await expect(
      getGoogleCard(page).getByText("Active", { exact: true }),
    ).toBeVisible();
  });

  test("should allow to reset google settings", async ({ page, mb }) => {
    await setupGoogleAuth(mb.api);
    await page.goto("/admin/settings/authentication");

    await icon(getGoogleCard(page), "ellipsis").click();
    await popover(page).getByText("Deactivate", { exact: true }).click();
    const updated = waitForUpdateSettings(page);
    await modal(page).getByRole("button", { name: "Deactivate" }).click();
    await updated;

    await expect(
      getGoogleCard(page).getByText("Set up", { exact: true }),
    ).toBeVisible();
  });

  test("should show an error message if the client id does not end with the correct suffix (metabase#15975)", async ({
    page,
  }) => {
    await page.goto("/admin/settings/authentication/google");

    await typeAndBlurUsingLabel(page, "Client ID", "fake-client-id");
    await page.getByRole("button", { name: "Save and enable" }).click();

    await expect(
      page
        .getByTestId("admin-layout-content")
        .getByText(
          `Invalid Google Sign-In Client ID: must end with ".${CLIENT_ID_SUFFIX}"`,
          { exact: true },
        ),
    ).toBeVisible();
  });

  test("should show the button to sign in via google only when enabled", async ({
    page,
    mb,
  }) => {
    await setupGoogleAuth(mb.api, { enabled: true });
    await mb.signOut();
    await page.goto("/auth/login");

    const loginPage = page.getByTestId("login-page");
    await expect(
      loginPage.getByText("Sign in with email", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Google/ })).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: /remember me/i }),
    ).toBeVisible();

    await mb.signInAsAdmin();
    await setupGoogleAuth(mb.api, { enabled: false });
    await mb.signOut();
    await page.goto("/auth/login");

    await expect(
      loginPage.getByText("Email address", { exact: true }),
    ).toBeVisible();
    await expect(
      loginPage.getByText("Password", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Google/ })).toHaveCount(0);
  });
});
