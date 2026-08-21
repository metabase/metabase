/**
 * Helpers for the Playwright port of
 * e2e/test/scenarios/embedding/embedding-theme-editor/theme-upsell.cy.spec.ts.
 *
 * Own module (parallel agents must not edit shared support files); the theme
 * *editor* / *listing* helpers are reused read-only from
 * support/embedding-theme-editor.ts and support/embedding-theme-listing.ts.
 */
import type { Locator, Page } from "@playwright/test";

/** The email of the `admin` snapshot user — mirrors support/sample-data.ts. */
export const ADMIN_EMAIL = "admin@metabase.test";

export const CLOUD_TRIAL_PATH = "/api/ee/cloud-proxy/mb-plan-trial-up-available";
const SESSION_PROPERTIES_PATH = "/api/session/properties";

/**
 * Port of the spec's
 * `cy.intercept("POST", "/api/ee/cloud-proxy/mb-plan-trial-up-available", { body })`.
 *
 * The upsell CTA text is driven by this response (`Try for free` when a trial
 * is available, `Upgrade to Pro` otherwise), so the tests pin it rather than
 * depending on what the real cloud proxy says. Register before `page.goto`.
 */
export async function mockTrialAvailability(
  page: Page,
  { available, planAlias = "pro-cloud" }: { available: boolean; planAlias?: string },
) {
  await page.route(
    (url) => url.pathname === CLOUD_TRIAL_PATH,
    async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ available, plan_alias: planAlias }),
      });
    },
  );
}

/**
 * Port of the spec's `cy.intercept("GET", "/api/session/properties", req =>
 * req.continue(res => { res.body["token-status"]["store-users"] = [...] }))`:
 * inject the current admin into `token-status.store-users` so the FE's
 * `getStoreUsers` selector reports `isStoreUser: true`.
 *
 * Native `fetch` rather than `route.fetch()` — the latter chokes on the
 * backend's set-cookie headers under bun (same workaround as
 * `mockSessionPropertiesTokenFeatures` in admin-tools-help.ts). Register
 * before `page.goto`; persists across reloads.
 */
export async function mockCurrentAdminAsStoreUser(
  page: Page,
  email: string = ADMIN_EMAIL,
) {
  await page.route(
    (url) => url.pathname === SESSION_PROPERTIES_PATH,
    async (route) => {
      const request = route.request();
      const response = await fetch(request.url(), {
        headers: await request.allHeaders(),
      });
      const body = (await response.json()) as Record<string, unknown>;
      const tokenStatus = (body["token-status"] ?? {}) as Record<
        string,
        unknown
      >;
      await route.fulfill({
        status: response.status,
        contentType: "application/json",
        body: JSON.stringify({
          ...body,
          "token-status": { ...tokenStatus, "store-users": [{ email }] },
        }),
      });
    },
  );
}

/**
 * Port of
 * `cy.findByTestId("admin-layout-sidebar").findByRole("link", { name: /Themes/ })`.
 * The name stays a substring match — upstream used a regex.
 */
export function themesNavLink(page: Page): Locator {
  return page
    .getByTestId("admin-layout-sidebar")
    .getByRole("link", { name: /Themes/ });
}

/**
 * Port of `cy.icon("gem").should("be.visible")` scoped inside a locator.
 * `should("be.visible")` on a multi-element subject is an ANY-of-set assertion
 * (PORTING.md rule 3), so filter to the visible matches and take the first.
 */
export function visibleGemIcon(scope: Locator): Locator {
  return scope.locator(".Icon-gem").filter({ visible: true }).first();
}

/** The `.Icon-gem` elements inside a scope, unfiltered (for absence checks). */
export function gemIcons(scope: Locator): Locator {
  return scope.locator(".Icon-gem");
}
