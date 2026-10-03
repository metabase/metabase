/**
 * Playwright port of e2e/test/scenarios/admin/security-center-snowplow.cy.spec.ts
 *
 * Snowplow is CAPTURED, not stubbed. PORTING rule 6 ("snowplow helpers → no-op
 * stubs") exists so specs where snowplow is incidental don't need the
 * snowplow-micro container; it cannot apply here, because the only assertion
 * in this spec is a snowplow assertion — stubbing it would port the single
 * test as a no-op. `installSnowplowCapture` (support/search-snowplow.ts)
 * records the tracker's own POST body at the browser boundary: no container,
 * no shared global store, no cross-slot contention.
 *
 * `security_center_page_viewed` is emitted client-side
 * (`metabase-enterprise/security_center/analytics.ts` → `trackSimpleEvent`,
 * fired from a `useEffect` in `SecurityCenterPage`), so the browser-boundary
 * capture sees it.
 *
 * Deviations, all recorded:
 * - `H.expectNoBadSnowplowEvents()` asks snowplow-micro for Iglu
 *   schema-validation failures. Without micro we cannot do that; the port
 *   degrades it to the structural check (`expectNoBadSnowplowEvents` in
 *   support/search-snowplow.ts — "every captured payload decoded into a
 *   well-formed self-describing event"). It therefore does NOT catch "the FE
 *   emits a field the Iglu schema rejects". Stated explicitly here because
 *   this is the one assertion the technique cannot reproduce.
 * - Upstream gates the describe on `Cypress.expose("IS_ENTERPRISE")` (a build
 *   flag). Playwright has no equivalent expose channel, so the port probes the
 *   running backend with `isOssBackend` — the same substitution every other
 *   ported `@enterprise`/`@OSS` gate uses. The spike jar is EE, so this
 *   EXECUTES rather than skips.
 * - `H.resetSnowplow()` → the capture starts empty and is installed before the
 *   first navigation (the tracker is created during app bootstrap).
 * - `H.enableTracking()` → `updateSetting("anon-tracking-enabled", true)`,
 *   ported literally even though the capture already forces that setting on
 *   client-side in both `window.MetabaseBootstrap` and
 *   `/api/session/properties`.
 * - The three `cy.intercept`s are `page.route` fulfils. They are registered
 *   AFTER `installSnowplowCapture` but none of them touches
 *   `/api/session/properties`, so the capture's own route (which must win) is
 *   unaffected — see the "last-registered handler runs first" gotcha in
 *   PORTING.md.
 */
import { isOssBackend } from "../support/admin";
import { expect, test } from "../support/fixtures";
import {
  expectNoBadSnowplowEvents,
  expectUnstructuredSnowplowEvent,
  installSnowplowCapture,
} from "../support/search-snowplow";
import type { SnowplowCapture } from "../support/search-snowplow";

test.describe("Security Center > Snowplow tracking", () => {
  let capture: SnowplowCapture;

  test.beforeEach(async ({ page, mb }) => {
    test.skip(await isOssBackend(mb.api), "requires EE build");

    await mb.restore();
    await mb.signInAsAdmin();
    await mb.api.updateSetting("anon-tracking-enabled", true);
    await mb.api.activateToken("pro-self-hosted");

    capture = await installSnowplowCapture(page, mb.baseUrl);

    // Stub the API so the page renders without a real EE backend.
    await page.route(
      (url) => url.pathname === "/api/ee/security-center",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ last_checked_at: null, advisories: [] }),
        }),
    );
    await page.route(
      (url) => url.pathname === "/api/user/recipients",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: [] }),
        }),
    );
    await page.route(
      (url) => url.pathname === "/api/channel",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ channels: {} }),
        }),
    );
  });

  test.afterEach(() => {
    // Structural stand-in for H.expectNoBadSnowplowEvents — see header.
    if (capture) {
      expectNoBadSnowplowEvents(capture);
    }
  });

  test("should send a page viewed event when visiting the security center", async ({
    page,
  }) => {
    await page.goto("/admin/security-center");
    await expect(
      page.getByRole("heading", { name: "Security Center", exact: true }),
    ).toBeVisible();
    await expectUnstructuredSnowplowEvent(capture, {
      event: "security_center_page_viewed",
    });
  });
});
