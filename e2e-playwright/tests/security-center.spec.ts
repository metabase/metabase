/**
 * Playwright port of e2e/test/scenarios/admin-2/security-center.cy.spec.ts
 *
 * Porting notes:
 * - H.setupSMTP is replaced by configureSmtpSettings: the Cypress helper PUTs
 *   /api/email, which live-validates the connection against the maildev
 *   container. The test only needs "SMTP configured" state, so the port
 *   writes the settings through the bulk settings endpoint instead — no
 *   container required.
 * - The no-token check anchors on the admin 404 page before asserting the
 *   security-center page's absence, so it can't pass vacuously mid-load.
 * - Cypress' scrollIntoView calls are dropped — Playwright visibility does
 *   not require the element to be in the viewport.
 */
import type { Page, Response } from "@playwright/test";

import {
  configureSmtpSettings,
  deleteToken,
  mockSessionProperty,
  seedSecurityAdvisories,
  type SecurityAdvisorySpec,
} from "../support/admin-extras";
import { resolveToken } from "../support/api";
import { modal } from "../support/dashboard";
import { test, expect } from "../support/fixtures";

const ADVISORIES = {
  critical: {
    advisory_id: "TEST-001",
    severity: "critical",
    title: "Critical RCE vulnerability",
    description: "Remote code execution via crafted input.",
    remediation: "Upgrade to 0.59.5",
    advisory_url: "https://example.com/advisory/TEST-001",
    affected_versions: [{ min: "0.58.0", fixed: "0.59.5" }],
    match_status: "active",
    published_at: "2026-03-20T00:00:00Z",
    updated_at: "2026-03-20T00:00:00Z",
  },
  high: {
    advisory_id: "TEST-002",
    severity: "high",
    title: "SQL injection in query builder",
    description: "Postgres databases are vulnerable to SQL injection.",
    remediation: "Upgrade to 0.58.8",
    affected_versions: [{ min: "0.54.0", fixed: "0.58.8" }],
    match_status: "resolved",
    published_at: "2026-03-15T00:00:00Z",
    updated_at: "2026-03-15T00:00:00Z",
  },
  medium: {
    advisory_id: "TEST-003",
    severity: "medium",
    title: "SSRF in GeoJSON endpoint",
    description: "Custom GeoJSON endpoints can be used for SSRF.",
    remediation: "Upgrade to 0.58.7",
    affected_versions: [{ min: "0.50.0", fixed: "0.58.7" }],
    match_status: "not_affected",
    published_at: "2026-03-10T00:00:00Z",
    updated_at: "2026-03-10T00:00:00Z",
  },
} satisfies Record<string, SecurityAdvisorySpec>;

test.describe("scenarios > admin > security center", () => {
  test.skip(
    !resolveToken("pro-self-hosted"),
    "Requires MB_PRO_SELF_HOSTED_TOKEN and an EE backend",
  );

  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.activateToken("pro-self-hosted");
  });

  test("should gate the security center behind a valid token and show empty state without advisories", async ({
    page,
    mb,
  }) => {
    // Without a token the page should not render
    await deleteToken(mb.api);
    await page.goto("/admin/security-center");
    // The route isn't registered without the feature, so the admin app falls
    // through to the 404 page — anchor on it before the absence check.
    await expect(
      page.getByText("The page you asked for couldn't be found.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByTestId("security-center-page")).toHaveCount(0);

    // Re-activate the token (no advisories seeded) → empty state
    await mb.api.activateToken("pro-self-hosted");
    await page.goto("/admin/security-center");
    await expect(
      securityCenterContent(page).getByText(/No known security issues/),
    ).toBeVisible();
  });

  test("should display advisory cards sorted by affected status and severity, and support filtering", async ({
    page,
    mb,
  }) => {
    await seedSecurityAdvisories(mb.api, Object.values(ADVISORIES));
    await page.goto("/admin/security-center");
    const content = securityCenterContent(page);
    await expect(
      content.getByText("Security Center", { exact: true }),
    ).toBeVisible();
    await expect(content.getByTestId("current-version")).toBeVisible();

    // All three advisory cards are visible
    await expect(advisoryCards(page)).toHaveCount(3);
    await expect(
      content.getByText("Critical RCE vulnerability", { exact: true }),
    ).toBeVisible();
    await expect(
      content.getByText("SQL injection in query builder", { exact: true }),
    ).toBeVisible();
    await expect(
      content.getByText("SSRF in GeoJSON endpoint", { exact: true }),
    ).toBeVisible();

    // Affected/critical advisory is sorted first
    await expect(
      advisoryCards(page)
        .first()
        .getByText("Critical RCE vulnerability", { exact: true }),
    ).toBeVisible();

    // Filter by severity
    await page.getByTestId("severity-filter").click();
    await page.getByRole("option", { name: "Critical", exact: true }).click();
    await expect(advisoryCards(page)).toHaveCount(1);
    await expect(
      content.getByText("Critical RCE vulnerability", { exact: true }),
    ).toBeVisible();

    // Clear severity filter (re-select to deselect)
    await page.getByTestId("severity-filter").click();
    await page
      .getByRole("option", { name: "All severities", exact: true })
      .click();
    await expect(advisoryCards(page)).toHaveCount(3);
  });

  test("should dismiss individual advisories, dismiss all, and toggle dismissed visibility", async ({
    page,
    mb,
  }) => {
    await seedSecurityAdvisories(mb.api, Object.values(ADVISORIES));
    await page.goto("/admin/security-center");
    const content = securityCenterContent(page);
    await expect(
      content.getByText("Security Center", { exact: true }),
    ).toBeVisible();

    // Dismiss the first advisory
    const acknowledgeResponse = waitForAcknowledgeOne(page);
    await advisoryCards(page)
      .first()
      .getByTestId("acknowledge-button")
      .click();
    await acknowledgeResponse;

    // Dismissed card is hidden by default
    await expect(advisoryCards(page)).toHaveCount(2);

    // Toggle to show dismissed — card reappears with "Dismissed" badge
    await page.getByTestId("show-acknowledged-filter").click({ force: true });
    await expect(advisoryCards(page)).toHaveCount(3);
    await expect(
      advisoryCards(page).first().getByTestId("acknowledge-button"),
    ).toHaveText("Dismissed");

    // Hide dismissed again before testing "Dismiss all"
    await page.getByTestId("show-acknowledged-filter").click({ force: true });
    await expect(advisoryCards(page)).toHaveCount(2);

    // Dismiss all non-affecting advisories
    const acknowledgeAllResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname ===
          "/api/ee/security-center/acknowledge",
    );
    await content.getByText("Dismiss all", { exact: true }).click();
    const acknowledgeAll = await acknowledgeAllResponse;
    const { advisory_ids } = acknowledgeAll.request().postDataJSON() as {
      advisory_ids: string[];
    };
    expect(advisory_ids).toContain("TEST-002");
    expect(advisory_ids).toContain("TEST-003");
    expect(advisory_ids).not.toContain("TEST-001");

    // "Dismiss all" button disappears when no non-affecting advisories remain
    await expect(
      content.getByText("Dismiss all", { exact: true }),
    ).toHaveCount(0);
  });

  test("should show nav item with badge and navigate to the security center", async ({
    page,
    mb,
  }) => {
    await seedSecurityAdvisories(mb.api, Object.values(ADVISORIES));
    await page.goto("/admin");

    // Nav item and badge are visible
    const navbar = page.getByTestId("admin-navbar");
    await expect(navbar.getByText("Security", { exact: true })).toBeVisible();
    await expect(page.getByTestId("security-center-badge")).toBeVisible();

    // Clicking navigates to security center
    await navbar.getByText("Security", { exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/security-center/);
    await expect(
      securityCenterContent(page).getByText("Security Center", {
        exact: true,
      }),
    ).toBeVisible();
  });

  test("should open notification settings modal, show Slack state, save settings, and default admin toggle with SMTP", async ({
    page,
    mb,
  }) => {
    await seedSecurityAdvisories(mb.api, Object.values(ADVISORIES));
    await configureSmtpSettings(mb.api);
    await page.goto("/admin/security-center");
    await expect(
      securityCenterContent(page).getByText("Security Center", {
        exact: true,
      }),
    ).toBeVisible();

    // Open modal and verify contents
    await page.getByTestId("notification-config-toggle").click();
    const dialog = modal(page);
    await expect(
      dialog.getByText("Notification settings", { exact: true }),
    ).toBeVisible();
    await expect(dialog.getByText("Email", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Slack", { exact: true })).toBeVisible();
    // Mixed content: the copy shares a <Text> with the "Set up Slack" anchor,
    // so an exact match (full element text) fails — substring regex instead.
    await expect(
      dialog.getByText(/Slack is not configured\./),
    ).toBeVisible();
    await expect(
      dialog.getByText("Set up Slack", { exact: true }),
    ).toBeVisible();

    // Send-to-all-admins toggle is checked by default when SMTP is configured
    await expect(page.getByTestId("send-to-admins-toggle")).toBeChecked();

    // Save settings
    const saveSettingsResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        new URL(response.url()).pathname === "/api/setting",
    );
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const saveSettings = await saveSettingsResponse;
    expect(saveSettings.request().postDataJSON()).toHaveProperty(
      "security-center-email-recipients",
    );
  });

  test("should trigger sync when clicking Check now", async ({ page }) => {
    await page.goto("/admin/security-center");
    await expect(
      securityCenterContent(page).getByText("Security Center", {
        exact: true,
      }),
    ).toBeVisible();

    const syncResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/ee/security-center/sync",
    );
    await page.getByTestId("sync-advisories").click();
    await syncResponse;
  });

  test.describe("per-version download link", () => {
    const DOWNLOADABLE_ADVISORY: SecurityAdvisorySpec = {
      advisory_id: "TEST-DL",
      severity: "critical",
      title: "Critical bug with a downloadable fix",
      description: "A critical issue shipping a per-version JAR fix.",
      remediation: "Upgrade to the patched release",
      affected_versions: [{ min: "0.58.0", fixed: "0.59.11" }],
      download_jar_urls: [
        { version: "0.58.11", url: "https://downloads.example.com/58.jar" },
        { version: "0.59.11", url: "https://downloads.example.com/59.jar" },
      ],
      match_status: "active",
      published_at: "2026-03-24T00:00:00Z",
      updated_at: "2026-03-24T00:00:00Z",
    };

    test("stores and returns download_jar_urls through the real backend", async ({
      mb,
    }) => {
      await seedSecurityAdvisories(mb.api, [DOWNLOADABLE_ADVISORY]);
      const response = await mb.api.get("/api/ee/security-center");
      const body = (await response.json()) as {
        advisories: { advisory_id: string; download_jar_urls: unknown }[];
      };
      const advisory = body.advisories.find(
        (candidate) => candidate.advisory_id === "TEST-DL",
      );
      expect(advisory?.download_jar_urls).toEqual([
        { version: "0.58.11", url: "https://downloads.example.com/58.jar" },
        { version: "0.59.11", url: "https://downloads.example.com/59.jar" },
      ]);
    });

    test("shows a single download button for the fix matching the instance major version", async ({
      page,
      mb,
    }) => {
      await mockSessionProperty(page, "version", { tag: "v0.59.3" });
      await seedSecurityAdvisories(mb.api, [DOWNLOADABLE_ADVISORY]);
      await page.goto("/admin/security-center");

      const card = advisoryCards(page).first();
      const downloadLink = card.getByRole("link", {
        name: /Download v0\.59\.11/,
      });
      await expect(downloadLink).toHaveAttribute(
        "href",
        "https://downloads.example.com/59.jar",
      );
      await expect(downloadLink).toHaveAttribute("target", "_blank");
      await expect(
        card.getByText("Download v0.58.11", { exact: true }),
      ).toHaveCount(0);
    });
  });
});

function securityCenterContent(page: Page) {
  return page.getByTestId("security-center-page");
}

function advisoryCards(page: Page) {
  return page.getByTestId("advisory-card");
}

function waitForAcknowledgeOne(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /^\/api\/ee\/security-center\/[^/]+\/acknowledge$/.test(
        new URL(response.url()).pathname,
      ),
  );
}
