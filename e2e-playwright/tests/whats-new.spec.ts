/**
 * Playwright port of
 * e2e/test/scenarios/onboarding/navbar/whats-new.cy.spec.js
 *
 * The navbar "What's new" notification: shown from the version reported by
 * /api/session/properties + the release records in /api/setting/version-info,
 * gated on the `last-acknowledged-version` setting. Both endpoints are stubbed
 * (support/whats-new.ts mockVersions) so the test controls version + release
 * notes.
 */
import { test, expect } from "../support/fixtures";
import {
  dismissWhatsNew,
  loadHomepage,
  mockVersions,
  seeWhatsNew,
} from "../support/whats-new";

test.describe("nav > what's new notification", () => {
  test.beforeEach(async ({ page, mb }) => {
    await mb.restore();

    await mockVersions(page, {
      currentVersion: "v0.48.0",
      versions: [
        { version: "v0.48.0", announcement_url: "metabase.com/releases/48" },
        { version: "v0.47.1", announcement_url: "metabase.com/releases/47" },
      ],
    });
  });

  test("should show a notification with a link to the release notes, and allow the dismissal of it", async ({
    page,
    mb,
  }) => {
    await mb.signInAsAdmin();
    await mb.api.put("/api/setting/last-acknowledged-version", { value: null });

    await loadHomepage(page);
    await expect(seeWhatsNew(page)).toBeVisible();

    // should persist reloads
    await loadHomepage(page);
    await expect(seeWhatsNew(page)).toBeVisible();

    await dismissWhatsNew(page).click();
    await expect(seeWhatsNew(page)).toHaveCount(0);

    await loadHomepage(page);
    await expect(seeWhatsNew(page)).toHaveCount(0);
  });

  test("it should show the notification for other users after one user dismissed it", async ({
    page,
    mb,
  }) => {
    await mb.signInAsAdmin();
    await mb.api.put("/api/setting/last-acknowledged-version", { value: null });
    await loadHomepage(page);
    await expect(seeWhatsNew(page)).toBeVisible();
    await dismissWhatsNew(page).click();

    await mb.signInAsNormalUser();
    await loadHomepage(page);
    await expect(seeWhatsNew(page)).toBeVisible();
  });
});
