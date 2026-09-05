/**
 * Per-spec helpers for the admin-settings port
 * (e2e/test/scenarios/admin-2/settings.cy.spec.js).
 *
 * New module per PORTING rule 9 — the shared support modules are imported
 * read-only.
 */
import type { Locator, Page, Route } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { expect } from "./fixtures";

// === site-url: undoing the harness's MB_SITE_URL pin ===

/**
 * Slot backends boot with `MB_SITE_URL` (support/worker-backend.ts) so that
 * absolute FE navigations stay on the slot instead of leaving for :4000.
 * Env beats the app DB, so on a slot backend `site-url` reports
 * `is_env_setting: true` — and three tests in this spec drive the site-url
 * widget, which then renders `SetByEnvVar` and has no input at all.
 *
 * Rather than losing those three tests to `test.fixme`, this shim makes the
 * *client* see the backend it would see without the pin, and nothing else:
 *
 *  1. `GET /api/setting` (the admin settings-details fetch behind
 *     `useGetAdminSettingsDetailsQuery`) has `site-url`'s `is_env_setting`
 *     forced to false, so `SetByEnvVarWrapper` renders the real widget.
 *  2. `PUT /api/setting/site-url` is passed through to the REAL backend — the
 *     validation under test (`metabase.system.settings/normalize-site-url`,
 *     which is what test #4506 asserts on) still runs for real and still
 *     answers 500 for an invalid URL. Only on a 2xx is the new value
 *     remembered.
 *  3. `GET /api/session/properties` (the source of `useAdminSetting(...).value`)
 *     reports the remembered value, so a successful write is visible to
 *     `HttpsOnlyWidget` the way it would be on an unpinned backend.
 *
 * Everything asserted still comes from the real backend; the shim only
 * removes the harness's own override. Returns the recorded value so a test
 * can check what actually got written.
 */
export async function unpinSiteUrl(page: Page, initialValue: string) {
  const state = { siteUrl: initialValue };

  await page.route(
    (url) => url.pathname === "/api/setting",
    async (route) => {
      if (route.request().method() !== "GET") {
        await route.fallback();
        return;
      }
      const body = (await passThroughJson(route)) as
        | { key: string; is_env_setting?: boolean; value?: unknown }[]
        | null;
      if (!Array.isArray(body)) {
        await route.fallback();
        return;
      }
      const patched = body.map((setting) =>
        setting.key === "site-url"
          ? { ...setting, is_env_setting: false, value: state.siteUrl }
          : setting,
      );
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(patched),
      });
    },
  );

  await page.route(
    (url) => url.pathname === "/api/setting/site-url",
    async (route) => {
      if (route.request().method() !== "PUT") {
        await route.fallback();
        return;
      }
      const response = await route.fetch();
      if (response.ok()) {
        const sent = route.request().postDataJSON() as { value?: string };
        if (typeof sent?.value === "string") {
          state.siteUrl = sent.value;
        }
      }
      await route.fulfill({ response });
    },
  );

  await page.route(
    (url) => url.pathname === "/api/session/properties",
    async (route) => {
      const body = (await passThroughJson(route)) as Record<
        string,
        unknown
      > | null;
      if (body == null) {
        await route.fallback();
        return;
      }
      body["site-url"] = state.siteUrl;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    },
  );

  return state;
}

/**
 * Fetch a route's real response body as JSON. Native fetch rather than
 * `route.fetch()` for the GET shims — the latter chokes on the backend's
 * set-cookie headers under bun (same workaround as support/admin-extras.ts).
 */
async function passThroughJson(route: Route): Promise<unknown | null> {
  const request = route.request();
  try {
    const response = await fetch(request.url(), {
      method: request.method(),
      headers: await request.allHeaders(),
    });
    return await response.json();
  } catch {
    return null;
  }
}

// === generic ===

/**
 * The `waitForResponse` side of a `cy.intercept(...).as(alias)` +
 * `cy.wait("@alias")` pair. Register BEFORE the triggering action (rule 2).
 */
export function waitForSetting(
  page: Page,
  method: "GET" | "PUT" | "POST" | "DELETE",
  pathname: string | RegExp,
) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === method &&
      (typeof pathname === "string"
        ? new URL(response.url()).pathname === pathname
        : pathname.test(new URL(response.url()).pathname)),
  );
}

/**
 * `cy.findByDisplayValue(value)` used as an ASSERTION (upstream calls it with
 * no follow-up assertion, relying on testing-library's throw-if-absent). The
 * shared `findByDisplayValue` in filters-repros.ts resolves the control; this
 * is the retrying "at least one control currently holds `value`" check.
 * Scans input/textarea/select like testing-library does.
 */
export async function expectDisplayValue(scope: Page | Locator, value: string) {
  await expect
    .poll(() => countDisplayValue(scope, value), {
      message: `expected a form control with display value ${JSON.stringify(value)}`,
    })
    .toBeGreaterThan(0);
}

/** The retrying negative of expectDisplayValue. */
export async function expectNoDisplayValue(
  scope: Page | Locator,
  value: string,
) {
  await expect.poll(() => countDisplayValue(scope, value)).toBe(0);
}

async function countDisplayValue(scope: Page | Locator, value: string) {
  return scope
    .locator("input, textarea, select")
    .evaluateAll(
      (elements, target) =>
        elements.filter(
          (element) => (element as HTMLInputElement).value === target,
        ).length,
      value,
    );
}

// === license & billing ===

/**
 * Port of the spec-local `mockBillingTokenFeatures`: stub the token-status
 * endpoint the enterprise `useLicense` hook reads.
 */
export async function mockBillingTokenFeatures(page: Page, features: string[]) {
  await page.route(
    (url) => url.pathname === "/api/premium-features/token/status",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          "valid-thru": "2099-12-31T12:00:00",
          valid: true,
          trial: false,
          features,
          status: "something",
        }),
      }),
  );
}

// === localization ===

/** Port of the spec-local setFirstWeekDayTo. */
export async function setFirstWeekDayTo(api: MetabaseApi, day: string) {
  await api.updateSetting("start-of-week", day.toLowerCase());
}
