import type { Page, Response } from "@playwright/test";

/**
 * Spec-local helpers for
 * tests/sdk-embed-setup-select-embed-experience.spec.ts.
 *
 * Everything reusable across the `sdk-iframe-embedding-setup/` tier lives in
 * `support/sdk-embed-setup.ts` (consumed read-only); `embedPreview` — the port
 * of `H.getSimpleEmbedIframeContent()`, which *gates on the iframe having
 * loaded* — is imported from the landed
 * `support/sdk-embed-setup-select-embed-options.ts` rather than re-written.
 *
 * This module holds only the three shapes that this spec needs and no landed
 * sibling has.
 */

const RECENTS_PATH = "/api/activity/recents";
const SESSION_PROPERTIES_PATH = "/api/session/properties";

/**
 * Port of `cy.intercept("GET", "/api/activity/recents?context=selections*")
 *   .as("recentActivity")` — armed, per PORTING.md rule 2, before the action
 * that triggers it.
 *
 * The glob is ported LITERALLY: `?` is a literal question mark and the
 * trailing `*` is the wildcard, so this matches `context=selections` requests
 * only. The shared `waitForRecentActivity` in `support/sdk-embed-setup.ts`
 * matches the pathname regardless of query string, which is *broader* than
 * upstream's alias — the wizard also issues recents calls with other
 * `context`/`model` params, and matching one of those would satisfy the wait
 * before the body this spec asserts on ever arrives.
 */
export function waitForRecentSelections(page: Page): Promise<Response> {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "GET" &&
      url.pathname === RECENTS_PATH &&
      url.search.startsWith("?context=selections")
    );
  });
}

/**
 * Port of
 * ```
 * cy.intercept("GET", "/api/activity/recents*", (req) => {
 *   req.on("response", (res) => res.setThrottle(0.3));
 * })
 * ```
 *
 * Cypress throttles the response *body* to 0.3 kbps, which for the recents
 * payload works out to several seconds of trickle. Playwright has no
 * bandwidth throttle, so the equivalent "the response is slow" is a fixed
 * delay before the real response is served. 3s is the margin used here — well
 * clear of the wizard's own render (the preview iframe paints in <1s), which
 * is the whole point of the test: the wizard must not commit to the fallback
 * dashboard while recents is still in flight.
 */
export async function throttleRecents(page: Page, delayMs = 3_000) {
  await page.route(
    (url) => url.pathname === RECENTS_PATH,
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      await route.continue();
    },
  );
}

/**
 * Port of
 * ```
 * cy.intercept("GET", "/api/session/properties", (req) => {
 *   req.continue((res) => { res.body["example-dashboard-id"] = id; res.send(); });
 * });
 * ```
 *
 * NOTE the interaction with `installSnowplowCapture`, which routes the same
 * path in the spec's `beforeEach`. Playwright runs the LAST-registered handler
 * first, so this one wins and the capture's patch would be lost — hence the
 * snowplow overrides are re-applied here verbatim. (The `addInitScript` half of
 * the capture is unaffected either way.)
 *
 * `fetch` rather than `route.fetch()` for the same reason the capture uses it:
 * `route.fetch()` chokes on the backend's set-cookie headers under bun.
 */
export async function patchExampleDashboardId(
  page: Page,
  {
    dashboardId,
    snowplowOrigin,
  }: { dashboardId: number; snowplowOrigin: string },
) {
  await page.route(
    (url) => url.pathname === SESSION_PROPERTIES_PATH,
    async (route) => {
      const request = route.request();
      const response = await fetch(request.url(), {
        method: request.method(),
        headers: await request.allHeaders(),
        redirect: "manual",
      });
      const body = (await response.json()) as Record<string, unknown>;
      await route.fulfill({
        status: response.status,
        contentType: "application/json",
        body: JSON.stringify({
          ...body,
          "example-dashboard-id": dashboardId,
          "anon-tracking-enabled": true,
          "snowplow-enabled": true,
          "snowplow-url": snowplowOrigin,
        }),
      });
    },
  );
}
