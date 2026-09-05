/**
 * Playwright port of e2e/test/scenarios/admin-2/sso/saml.cy.spec.js
 *
 * Porting notes:
 * - SAML is a premium feature, so the whole describe is gated on the
 *   pro-self-hosted token (PORTING rule 7) — the Cypress beforeEach calls
 *   H.activateToken("pro-self-hosted") unconditionally.
 * - The three `cy.intercept(...).as()` aliases become `page.waitForResponse`
 *   predicates registered before the triggering action (PORTING rule 2):
 *     updateSettings     → PUT /api/setting        (bulk, exact pathname)
 *     updateSetting      → PUT /api/setting/<key>  (single, pathname prefix)
 *     updateSamlSettings → PUT /api/saml/settings
 * - getSamlCard() is `getByTestId("saml-setting")`: upstream's
 *   findByText("SAML").parent().parent() resolves to exactly that CardRoot.
 * - The group-mappings tests exercise the shared widget through the SAML page;
 *   the two shared driver functions live in support/sso-saml.ts.
 */
import type { Page } from "@playwright/test";

import { getSamlCertificate, setupSaml } from "../support/admin";
import { resolveToken } from "../support/api";
import { test, expect } from "../support/fixtures";
import { undoToast } from "../support/metrics";
import {
  checkGroupConsistencyAfterDeletingMappings,
  crudGroupMappingsWidget,
  enterSamlSettings,
  getSamlCard,
  goToAuthOverviewPage,
  typeAndBlurUsingLabel,
} from "../support/sso-saml";
import { icon, modal, popover } from "../support/ui";

function waitForUpdateSamlSettings(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname === "/api/saml/settings",
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

test.describe("scenarios > admin > settings > SSO > SAML", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "SAML is premium — requires MB_PRO_SELF_HOSTED_TOKEN and an EE backend",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test("should allow to save and enable saml", async ({ page }) => {
    await page.goto("/admin/settings/authentication/saml");

    await enterSamlSettings(page, getSamlCertificate());
    const saved = waitForUpdateSamlSettings(page);
    await page.getByRole("button", { name: "Save and enable" }).click();
    await saved;
    await expect(
      page.getByRole("button", { name: "Success", exact: true }),
    ).toBeVisible();

    await goToAuthOverviewPage(page);
    await expect(
      getSamlCard(page).getByText("Active", { exact: true }),
    ).toBeVisible();
  });

  test("should allow to update saml settings", async ({ page, mb }) => {
    await setupSaml(mb.api);
    await page.goto("/admin/settings/authentication/saml");

    await typeAndBlurUsingLabel(
      page,
      /SAML Identity Provider URL/i,
      "https://other.test",
    );
    const saved = waitForUpdateSamlSettings(page);
    await page.getByRole("button", { name: "Save changes" }).click();
    await saved;
    await expect(
      page
        .getByTestId("admin-layout-content")
        .getByRole("button", { name: "Success", exact: true }),
    ).toBeVisible();

    await goToAuthOverviewPage(page);
    await expect(
      getSamlCard(page).getByText("Active", { exact: true }),
    ).toBeVisible();
  });

  test("should allow to disable and enable saml", async ({ page, mb }) => {
    await setupSaml(mb.api);
    await page.goto("/admin/settings/authentication");

    await icon(getSamlCard(page), "ellipsis").click();
    let updated = waitForUpdateSetting(page);
    await popover(page).getByText("Pause", { exact: true }).click();
    await updated;
    await expect(
      getSamlCard(page).getByText("Paused", { exact: true }),
    ).toBeVisible();

    await icon(getSamlCard(page), "ellipsis").click();
    updated = waitForUpdateSetting(page);
    await popover(page).getByText("Resume", { exact: true }).click();
    await updated;
    await expect(
      getSamlCard(page).getByText("Active", { exact: true }),
    ).toBeVisible();
  });

  test("should allow to reset saml settings", async ({ page, mb }) => {
    await setupSaml(mb.api);
    await page.goto("/admin/settings/authentication");

    await icon(getSamlCard(page), "ellipsis").click();
    await popover(page).getByText("Deactivate", { exact: true }).click();
    const updated = waitForUpdateSettings(page);
    await modal(page).getByRole("button", { name: "Deactivate" }).click();
    await updated;

    await expect(
      getSamlCard(page).getByText("Set up", { exact: true }),
    ).toBeVisible();
  });

  test("should allow the user to enable/disable user provisioning", async ({
    page,
    mb,
  }) => {
    await setupSaml(mb.api);
    await page.goto("/admin/settings/authentication/saml");

    const setting = page.getByTestId("saml-user-provisioning-enabled?-setting");
    const updated = waitForUpdateSetting(page);
    await setting.getByText(/^Disabled/).click();
    await updated;
    await expect(
      undoToast(page).getByText("Changes saved", { exact: true }),
    ).toBeVisible();
  });

  test.describe("Group Mappings Widget", () => {
    test("should allow deleting mappings along with deleting, or clearing users of, mapped groups", async ({
      page,
    }) => {
      await crudGroupMappingsWidget(page, "saml");
    });

    test("should allow deleting mappings with groups, while keeping remaining mappings consistent with their undeleted groups", async ({
      page,
    }) => {
      await checkGroupConsistencyAfterDeletingMappings(page, "saml");
    });
  });
});
