/**
 * Helpers for the "What's new" navbar-notification port
 * (e2e/test/scenarios/onboarding/navbar/whats-new.cy.spec.js).
 *
 * The notification is shown from the version reported by
 * /api/session/properties (`version.tag`) plus the release records in
 * /api/setting/version-info, gated on the `last-acknowledged-version`
 * setting. Both endpoints are stubbed so the test controls the version and
 * release-notes without touching a real update server.
 */
import type { Page } from "@playwright/test";

import { mockSessionProperty } from "./admin-extras";
import { expect } from "./fixtures";
import { icon, navigationSidebar } from "./ui";

/** Port of mockVersion (createMockVersionInfoRecord, metabase-types/api/mocks). */
type VersionRecord = {
  version: string;
  announcement_url?: string;
};

function versionInfoRecord(record: VersionRecord) {
  return {
    released: "2021-01-01",
    patch: true,
    highlights: ["Bug fix"],
    ...record,
  };
}

/**
 * Port of the spec-local mockVersions: stub /api/setting/version-info with the
 * given release records (first is `latest`, the rest `older`) and overwrite the
 * session-properties `version` with `{ tag: currentVersion }`. Register before
 * the navigation that triggers the requests.
 */
export async function mockVersions(
  page: Page,
  {
    currentVersion,
    versions = [],
  }: { currentVersion: string; versions?: VersionRecord[] },
) {
  const [latest, ...older] = versions;
  const versionInfo = {
    latest: latest ? versionInfoRecord(latest) : null,
    older: older.map(versionInfoRecord),
  };

  await page.route(
    (url) => url.pathname === "/api/setting/version-info",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(versionInfo),
      }),
  );

  await mockSessionProperty(page, "version", { tag: currentVersion });
}

/**
 * Port of the spec-local loadHomepage: visit "/", wait for the stubbed
 * session-properties + version-info responses, then confirm the page finished
 * loading before assertions.
 */
export async function loadHomepage(page: Page) {
  const sessionProperties = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/session/properties",
  );
  const versionInfo = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/setting/version-info",
  );

  await page.goto("/");

  await Promise.all([sessionProperties, versionInfo]);

  // make sure page is loaded (findByText("loading").should("not.exist") →
  // exact-string match per port rule 1)
  await expect(page.getByText("loading", { exact: true })).toHaveCount(0);
  await expect(
    navigationSidebar(page).getByText("Home", { exact: true }),
  ).toBeVisible();
}

/** The navbar "See what's new" link. findByText string → exact (rule 1). */
export function seeWhatsNew(page: Page) {
  return navigationSidebar(page).getByText("See what's new", { exact: true });
}

/** The navbar notification's dismiss (close) icon. */
export function dismissWhatsNew(page: Page) {
  return icon(navigationSidebar(page), "close");
}
