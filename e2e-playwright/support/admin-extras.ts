/**
 * Helpers for the admin-2 ports (error-reporting, security-center) — ports of:
 * - e2e/support/helpers/api/seedSecurityAdvisories.ts
 * - H.deleteToken (e2e-token-helpers.ts)
 * - H.mockSessionProperty (e2e-mock-app-settings-helpers.js)
 * - H.setupSMTP, minus the maildev dependency (see configureSmtpSettings)
 * - the error-reporting spec's getDiagnosticInfoFile (cy.verifyDownload +
 *   findFiles + readFile tasks collapse into one Playwright download event)
 */
import fs from "fs";

import type { Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { modal } from "./dashboard";
import { expect } from "./fixtures";
import { maildevSmtpPort } from "./maildev";

// === port of e2e/support/helpers/api/seedSecurityAdvisories.ts ===

export type SecurityAdvisorySpec = {
  advisory_id: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  remediation: string;
  advisory_url?: string | null;
  affected_versions: { min: string; fixed: string }[];
  download_jar_urls?: { version: string; url: string }[];
  matching_query?: Record<string, string> | null;
  match_status: "unknown" | "active" | "resolved" | "not_affected" | "error";
  published_at: string;
  updated_at?: string;
};

/** Nuke all existing security advisories and insert the provided ones. */
export async function seedSecurityAdvisories(
  api: MetabaseApi,
  advisories: SecurityAdvisorySpec[],
) {
  await api.post("/api/testing/security-advisories", { advisories });
}

/** Port of H.deleteToken (e2e-token-helpers.ts). */
export async function deleteToken(api: MetabaseApi) {
  await api.put(
    "/api/setting/premium-embedding-token",
    { value: null },
    { failOnStatusCode: false },
  );
}

/**
 * Port of H.mockSessionProperty: fetch the real /api/session/properties
 * response and overwrite one property. Native fetch instead of route.fetch()
 * — the latter chokes on the backend's set-cookie headers when the runner is
 * bun (same workaround as support/search.ts). Register before page.goto.
 */
export async function mockSessionProperty(
  page: Page,
  property: string,
  value: unknown,
) {
  await page.route(
    (url) => url.pathname === "/api/session/properties",
    async (route) => {
      const request = route.request();
      const response = await fetch(request.url(), {
        headers: await request.allHeaders(),
      });
      const body = (await response.json()) as Record<string, unknown>;
      body[property] = value;
      await route.fulfill({
        status: response.status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    },
  );
}

/**
 * Stand-in for H.setupSMTP: the Cypress helper PUTs /api/email, which
 * live-validates the SMTP connection and therefore needs the maildev
 * container. The security-center spec only needs the "SMTP is configured"
 * state (it never sends mail), so write the same settings through the bulk
 * settings endpoint, which skips connection validation.
 */
export async function configureSmtpSettings(api: MetabaseApi) {
  await api.put("/api/setting", {
    "email-smtp-host": "localhost",
    "email-smtp-port": maildevSmtpPort(),
    "email-smtp-username": "admin",
    "email-smtp-password": "admin",
    "email-smtp-security": "none",
    "email-from-address": "mailer@metabase.test",
    "email-from-name": "Metabase",
    "email-reply-to": ["reply-to@metabase.test"],
  });
}

// === error-reporting helpers ===

/**
 * The "Download diagnostics" shortcut is tinykeys "$mod+f1"
 * (frontend/src/metabase/palette/shortcuts/global.ts): $mod resolves to Meta
 * on Apple platforms and Control elsewhere. The Cypress spec hardcoded
 * Control (its CI runs on Linux); resolve per platform so the port works on
 * both a dev Mac and Linux CI.
 */
export async function pressDownloadDiagnosticsShortcut(page: Page) {
  const isApplePlatform = await page.evaluate(() =>
    /Mac|iPod|iPhone|iPad/.test(navigator.platform),
  );
  await page.keyboard.press(isApplePlatform ? "Meta+F1" : "Control+F1");
}

export type DiagnosticInfoFile = {
  entityName?: string;
  url?: string;
  // The hydrated entity (dashboard / card / collection) or null. Typed
  // loosely because the tests poke at entity-specific fields like dashcards.
  entityInfo?: { id?: number; dashcards?: unknown[] } | null;
} & Record<string, unknown>;

/**
 * Port of the error-reporting spec's getDiagnosticInfoFile: click Download in
 * the diagnostic modal, wait for the real download (a data: URI anchor), and
 * parse the JSON payload. Also keeps the original's gate that the modal has
 * closed before reading the file.
 */
export async function downloadDiagnosticInfo(
  page: Page,
): Promise<DiagnosticInfoFile> {
  const dialog = modal(page);
  const downloadEvent = page.waitForEvent("download");
  await dialog.getByRole("button", { name: /Download/i }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toContain("metabase-diagnostic-info-");
  await expect(dialog).toHaveCount(0);
  const filePath = await download.path();
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}
