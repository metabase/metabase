/**
 * Helpers for the sankey spec port
 * (e2e/test/scenarios/visualizations-charts/sankey.cy.spec.js).
 *
 * Kept in its own module per the porting rules (parallel agents never edit
 * shared support files). Two helpers live here:
 *
 * 1. `sankeyEdge` — a port of the `H` visual-tests helper
 *    (e2e-visual-tests-helpers.js): sankey edges are the translucent
 *    (`fill-opacity="0.2"`) fill paths. Consolidation candidate: fold into a
 *    charts module alongside chartPathWithFillColor / pieSlices / trendLine.
 * 2. `mockDevelopmentMode` — the spec's `cy.intercept("/api/session/properties",
 *    req => req.continue(res => res.body["token-features"].development_mode = …))`.
 *    Mirrors admin-extras.mockSessionProperty but pokes a nested key.
 */
import type { Locator, Page } from "@playwright/test";

import { echartsContainer } from "./charts";

/**
 * Port of H.sankeyEdge(color): the sankey link paths, which render with the
 * given fill color at 20% opacity.
 */
export function sankeyEdge(page: Page, color: string): Locator {
  return echartsContainer(page).locator(
    `path[fill="${color}"][fill-opacity="0.2"]`,
  );
}

/**
 * Port of the spec's `cy.intercept("/api/session/properties", ...)` that flips
 * `token-features.development_mode`. Register before the first navigation that
 * boots the app (the createDashboard/createNativeQuestion API calls go through
 * the APIRequestContext, not the page, so they're unaffected).
 */
export async function mockDevelopmentMode(page: Page, devMode: boolean) {
  await page.route(
    (url) => url.pathname === "/api/session/properties",
    async (route) => {
      const request = route.request();
      const response = await fetch(request.url(), {
        headers: await request.allHeaders(),
      });
      const body = (await response.json()) as {
        "token-features": Record<string, unknown>;
      };
      body["token-features"].development_mode = devMode;
      await route.fulfill({
        status: response.status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    },
  );
}
