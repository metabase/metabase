/**
 * Helpers for the data-studio metrics spec port
 * (e2e/test/scenarios/data-studio/data-studio-metrics.cy.spec.ts).
 *
 * Only the surface no existing module already covers lives here — per PORTING
 * rule 9 the shared support/*.ts modules are imported read-only and never
 * edited. Reused rather than reinvented:
 *
 * - `MetricEditor` (queryEditor / saveButton / cancelButton) and
 *   `runButtonInOverlay` from support/metrics-editing.ts
 * - `MetricPage` (header / moreMenu / aboutPage) from support/metrics.ts
 * - `dataStudioNav`, `metricMoreMenu`, `createLibraryWithItems`,
 *   `visitLibrary`, `libraryNewButton` from support/data-studio-library.ts
 *   (the fourth copy of `dataStudioNav` already exists — no fifth added)
 * - `DependencyGraph` / `waitForBackfillComplete` from support/dependency-graph.ts
 * - the snowplow browser-boundary capture from support/search-snowplow.ts
 *
 * What is new here: the three MetricPage tab/sidebar locators nothing else
 * ports (`definitionTab`, `dependenciesTab`, `aboutPageDescriptionSidebar`,
 * `exploreLink`), the spec-local `visitMetricPage`, and the response waits.
 *
 * Fold into support/metrics.ts at consolidation — together with
 * metrics-editing.ts's `MetricEditor`, this is the rest of the single Cypress
 * `MetricPage` object (e2e/support/helpers/e2e-metric-page-helpers.ts) split
 * across three port modules.
 */
import type { Locator, Page, Response } from "@playwright/test";

import { MetricPage } from "./metrics";

/**
 * The rest of Cypress's MetricPage (e2e-metric-page-helpers.ts). Header tabs
 * are `header().findByText(name)` — testing-library string matching is exact
 * (PORTING rule 1).
 */
export const MetricDetail = {
  /** MetricPage.definitionTab. */
  definitionTab: (page: Page): Locator =>
    MetricPage.header(page).getByText("Definition", { exact: true }),
  /** MetricPage.dependenciesTab. */
  dependenciesTab: (page: Page): Locator =>
    MetricPage.header(page).getByText("Dependencies", { exact: true }),
  /** MetricPage.aboutPageDescriptionSidebar. */
  aboutPageDescriptionSidebar: (page: Page): Locator =>
    MetricPage.aboutPage(page).getByTestId("metric-description-sidebar"),
  /** MetricPage.exploreLink. */
  exploreLink: (page: Page): Locator => page.getByTestId("explore-link"),
};

/**
 * Port of the spec-local visitMetricPage: navigate straight to the metric by
 * id rather than clicking it out of the lazily-loading library tree.
 */
export async function visitMetricPage(page: Page, metricId: number) {
  await page.goto(`/data-studio/library/metrics/${metricId}`);
}

// === response waits (PORTING rule 2 — register BEFORE the trigger) ===

/** The `@createCard` alias: cy.intercept("POST", "/api/card"). */
export function waitForCreateCard(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/card",
  );
}

/** The `@updateCard` alias: cy.intercept("PUT", "/api/card/*"). */
export function waitForUpdateCard(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      /^\/api\/card\/[^/]+$/.test(new URL(response.url()).pathname),
  );
}

/** The `@updateCacheConfig` alias: cy.intercept("PUT", "/api/cache"). */
export function waitForUpdateCacheConfig(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname === "/api/cache",
  );
}

/**
 * Rename the metric's EditableText title (the `aboutPage` header) and commit
 * with Enter, the way upstream's `.clear().type("…{enter}")` does.
 *
 * `fill()` is not usable here — EditableText only marks itself dirty on real
 * keystrokes (PORTING wave-5 gotcha), so the Enter would save nothing and the
 * PUT would never fire.
 */
export async function renameMetricTitle(
  page: Page,
  input: Locator,
  name: string,
) {
  await input.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type(name, { delay: 10 });
  const update = waitForUpdateCard(page);
  await page.keyboard.press("Enter");
  await update;
}
