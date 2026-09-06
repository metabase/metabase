/**
 * Playwright port of e2e/test/scenarios/admin-2/authentication.cy.spec.ts
 *
 * Porting notes:
 * - The Cypress `@OSS` tag has no Playwright equivalent, so the OSS-only test
 *   probes the backend's version tag at runtime (v0.x = OSS) and skips
 *   against EE builds, which always render the EE auth providers.
 * - The pass-through `cy.intercept("GET", "/api/ee/scim/api_key")` in the
 *   "warning when SCIM is enabled without a token" test was never awaited,
 *   so it is dropped.
 * - The Mantine Switch input is visually hidden, so toggling clicks the
 *   visible "Enabled"/"Disabled" label text; state assertions use the label
 *   text and the input's checked state.
 */
import type { Locator, Page } from "@playwright/test";

import { isOssBackend, setupSaml } from "../support/admin";
import { resolveToken } from "../support/api";
import { modal } from "../support/dashboard";
import { test, expect } from "../support/fixtures";
import { main } from "../support/sharing";

// 40 asterisks, as in the Cypress spec.
const TOKEN_MASK = "****************************************";

test.describe("scenarios > admin > settings > user provisioning", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test.describe("oss", () => {
    test("user provisioning page should not be available for OSS customers", async ({
      page,
      mb,
    }) => {
      test.skip(
        !(await isOssBackend(mb.api)),
        "@OSS-only test — requires an OSS build",
      );

      await page.goto("/admin/settings/authentication/user-provisioning");

      // falls back to the authentication page
      await expect(page.getByTestId("google-setting")).toBeVisible();
      await expect(page.getByTestId("ldap-setting")).toBeVisible();
      await expect(page.getByTestId("api-keys-setting")).toBeVisible();

      // no EE auth providers
      await expect(page.getByTestId("saml-setting")).toHaveCount(0);
    });
  });

  test.describe("scim settings management", () => {
    test.skip(
      !resolveToken("pro-self-hosted"),
      "Requires MB_PRO_SELF_HOSTED_TOKEN and an EE backend",
    );

    test.beforeEach(async ({ mb }) => {
      await mb.api.activateToken("pro-self-hosted");
    });

    test("should be able to setup and manage scim feature", async ({
      page,
    }) => {
      await page.goto("/admin/settings/authentication/user-provisioning");

      // should not show endpoint and token inputs if scim has never been
      // enabled before (wait for the page to render first, so the absence
      // checks aren't passing vacuously against a still-loading page)
      await expect(scimSetting(page)).toBeVisible();
      await expect(scimEndpointInput(main(page))).toHaveCount(0);
      await expect(scimTokenInput(main(page))).toHaveCount(0);

      // can enable scim
      await toggleScim(page);

      // should show unmasked info in modal
      const dialog = modal(page);
      await expect(
        dialog.getByText("Here's what you'll need to set SCIM up", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(scimEndpointInput(dialog)).toHaveValue(/\/api\/ee\/scim\/v2/);
      // save to compare with masked token
      const initialUnmaskedToken = await scimTokenInput(dialog).inputValue();
      expect(initialUnmaskedToken).not.toContain(TOKEN_MASK);
      await dialog.getByRole("button", { name: /Done/ }).click();

      // should show masked info in main page + should match unmasked token
      await expect(scimEndpointInput(main(page))).toHaveValue(
        /\/api\/ee\/scim\/v2/,
      );
      await expectMaskedToken(page, initialUnmaskedToken);

      // should be able to regenerate a token
      await page.getByRole("button", { name: /Regenerate/ }).click();

      await expect(
        dialog.getByText("Regenerate token?", { exact: true }),
      ).toBeVisible();
      await dialog.getByRole("button", { name: /Regenerate now/ }).click();

      await expect(
        dialog.getByText("Copy and save the SCIM token", { exact: true }),
      ).toBeVisible();
      // the token input only renders once the regenerate request resolves
      // (Cypress asserted the value no longer reads "Loading")
      await expect(scimTokenInput(dialog)).toBeVisible();
      await expect(scimTokenInput(dialog)).not.toHaveValue(/Loading/);
      const regeneratedToken = await scimTokenInput(dialog).inputValue();
      expect(regeneratedToken).not.toContain(TOKEN_MASK);
      await dialog.getByRole("button", { name: /Done/ }).click();

      await expectMaskedToken(page, regeneratedToken);

      // should be able to cancel regenerating a token
      await page.getByRole("button", { name: /Regenerate/ }).click();

      await expect(
        dialog.getByText("Regenerate token?", { exact: true }),
      ).toBeVisible();
      await dialog.getByRole("button", { name: /Cancel/ }).click();
      await expect(modal(page)).toHaveCount(0);

      await expectMaskedToken(page, regeneratedToken);

      // should be able to disable scim and info stay
      await toggleScim(page);
      await expect(
        scimSetting(page).getByText("Disabled", { exact: true }),
      ).toBeVisible();
      await expect(scimEndpointInput(main(page))).toBeVisible();
      await expect(scimTokenInput(main(page))).toBeVisible();
      await expect(
        page.getByRole("button", { name: /Regenerate/ }),
      ).toBeDisabled();

      // should be able to re-enable
      await toggleScim(page);
      await expect(
        scimSetting(page).getByText("Enabled", { exact: true }),
      ).toBeVisible();
    });

    test("should warn users that saml user provisioning will be disabled before enabling scim", async ({
      page,
      mb,
    }) => {
      await setupSaml(mb.api);
      await page.goto("/admin/settings/authentication/user-provisioning");

      const samlWarningMessage =
        "When enabled, SAML user provisioning will be turned off in favor of SCIM.";

      // message should exist while scim has never been enabled
      await expect(
        main(page).getByText(samlWarningMessage, { exact: true }),
      ).toBeVisible();

      // message should not exist once scim has been enabled
      await expect(
        scimSetting(page).getByText("Disabled", { exact: true }),
      ).toBeVisible();
      await toggleScim(page);
      await expect(
        scimSetting(page).getByText("Enabled", { exact: true }),
      ).toBeVisible();

      await modal(page).getByRole("button", { name: /Done/ }).click();

      await expect(
        main(page).getByText(samlWarningMessage, { exact: true }),
      ).toHaveCount(0);

      // message should still not exist even after scim has been disabled
      await toggleScim(page);
      await expect(scimToggle(page)).not.toBeChecked();
      await expect(
        main(page).getByText(samlWarningMessage, { exact: true }),
      ).toHaveCount(0);
    });

    test("should properly handle errors", async ({ page }) => {
      await routeScimTokenFailure(page);

      await page.goto("/admin/settings/authentication/user-provisioning");

      // toggling SCIM on triggers the failing token-generation POST
      const tokenFailure = waitForScimTokenPost(page);
      await toggleScim(page);
      await tokenFailure;

      // no modal is opened on failure — error surfaces directly on the form
      await expect(modal(page)).toHaveCount(0);

      await expect(
        main(page).getByText("Token failed to generate, Please try again.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        main(page).getByRole("button", { name: /Retry/ }),
      ).toBeVisible();
    });

    test("should close the regenerate modal and surface an error on the token field when regenerate fails", async ({
      page,
    }) => {
      // generate an initial token via the UI
      await page.goto("/admin/settings/authentication/user-provisioning");
      await toggleScim(page);
      const dialog = modal(page);
      await dialog.getByRole("button", { name: /Done/ }).click();

      // now make subsequent regenerate calls fail
      await routeScimTokenFailure(page);

      await page.getByRole("button", { name: /Regenerate/ }).click();
      await expect(
        dialog.getByText("Regenerate token?", { exact: true }),
      ).toBeVisible();
      const regenerateFailure = waitForScimTokenPost(page);
      await dialog.getByRole("button", { name: /Regenerate now/ }).click();
      await regenerateFailure;

      // the post-confirm modal does not appear; error surfaces on the form
      await expect(modal(page)).toHaveCount(0);
      await expect(
        main(page).getByText("Failed to regenerate token. Please try again.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        main(page).getByText("An error occurred", { exact: true }),
      ).toHaveCount(0);
      await expect(
        main(page).getByRole("button", { name: /Regenerate/ }),
      ).toBeVisible();
    });

    test("should show a warning when SCIM is enabled without a token", async ({
      page,
      mb,
    }) => {
      // simulate enabling SCIM via config file / env var: enable it
      // server-side, no token generated
      await mb.api.updateSetting("scim-enabled", true);
      await page.goto("/admin/settings/authentication/user-provisioning");

      await expect(
        main(page).getByText(
          "Generate a SCIM token below to complete the setup.",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        main(page).getByRole("button", { name: /Generate/ }),
      ).toBeVisible();
      await expect(
        main(page).getByText("Token failed to generate, Please try again.", {
          exact: true,
        }),
      ).toHaveCount(0);

      // warning is removed once a token has been generated
      await main(page).getByRole("button", { name: /Generate/ }).click();
      const dialog = modal(page);
      await expect(
        dialog.getByText("Here's what you'll need to set SCIM up", {
          exact: true,
        }),
      ).toBeVisible();
      await dialog.getByRole("button", { name: /Done/ }).click();

      await expect(
        main(page).getByText(
          "Generate a SCIM token below to complete the setup.",
          { exact: true },
        ),
      ).toHaveCount(0);
      await expect(
        main(page).getByRole("button", { name: /Regenerate/ }),
      ).toBeVisible();
    });
  });
});

function scimSetting(page: Page): Locator {
  return page.getByTestId("scim-enabled-setting");
}

function scimToggle(page: Page): Locator {
  return scimSetting(page).getByLabel(/Enabled|Disabled/);
}

/**
 * The Mantine Switch renders an invisible checkbox input stretched over the
 * control; it intercepts pointer events, so clicking the label text fails
 * Playwright's actionability check. Click the switch input itself — it's the
 * actual hit-target.
 */
async function toggleScim(page: Page) {
  await scimSetting(page).getByRole("switch").click({ force: true });
}

function scimEndpointInput(scope: Page | Locator): Locator {
  return scope.getByLabel("SCIM endpoint URL", { exact: true });
}

function scimTokenInput(scope: Page | Locator): Locator {
  return scope.getByLabel("SCIM token", { exact: true });
}

/** The main page's token input shows `mb_<prefix>` + the 40-char mask. */
async function expectMaskedToken(page: Page, unmaskedToken: string) {
  const tokenInput = scimTokenInput(main(page));
  await expect(tokenInput).toHaveValue(/mb_/);
  await expect(tokenInput).toHaveValue(/\*{4}/);
  const maskedToken = await tokenInput.inputValue();
  expect(maskedToken).toContain(TOKEN_MASK);
  expect(maskedToken).toContain(unmaskedToken.slice(0, 7));
}

/** Cypress: cy.intercept("POST", "/api/ee/scim/api_key", { statusCode: 500, ... }) */
async function routeScimTokenFailure(page: Page) {
  await page.route(
    (url) => url.pathname === "/api/ee/scim/api_key",
    (route) =>
      route.request().method() === "POST"
        ? route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ message: "An error occurred" }),
          })
        : route.fallback(),
  );
}

function waitForScimTokenPost(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/ee/scim/api_key",
  );
}
