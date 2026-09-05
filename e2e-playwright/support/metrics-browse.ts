/**
 * Helpers for the Browse > Metrics page spec, ported from the spec-local
 * functions in e2e/test/scenarios/metrics/browse.cy.spec.ts.
 *
 * New helpers live here (not in the shared support/*.ts files, which parallel
 * porting agents edit); everything else is imported read-only. Fold into
 * metrics.ts at consolidation.
 */
import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { assertIsEllipsified } from "./search";
import { getSidebarSectionTitle } from "./organization";
import { icon, navigationSidebar, popover } from "./ui";
import { MetricPage } from "./metrics";

/** Port of the spec-local metricsTable: cy.findByLabelText("Table of metrics"). */
export function metricsTable(page: Page): Locator {
  return page.getByLabel("Table of metrics", { exact: true });
}

/** Port of the spec-local findMetric: metricsTable().findByText(name) (exact). */
export function findMetric(page: Page, name: string): Locator {
  return metricsTable(page).getByText(name, { exact: true });
}

/** Port of the spec-local getMetricsTableItem: the index-th metric-name cell. */
export function getMetricsTableItem(page: Page, index: number): Locator {
  return metricsTable(page).getByTestId("metric-name").nth(index);
}

/** Port of the spec-local shouldHaveBookmark. */
export async function shouldHaveBookmark(page: Page, name: string) {
  await expect(getSidebarSectionTitle(page, /Bookmarks/)).toBeVisible();
  await expect(
    navigationSidebar(page).getByText(name, { exact: true }),
  ).toBeVisible();
}

/** Port of the spec-local shouldNotHaveBookmark. */
export async function shouldNotHaveBookmark(page: Page, name: string) {
  await expect(getSidebarSectionTitle(page, /Bookmarks/)).toHaveCount(0);
  await expect(
    navigationSidebar(page).getByText(name, { exact: true }),
  ).toHaveCount(0);
}

/**
 * Port of the spec-local verifyMetric: open the metric, verify it from the more
 * menu, then return to the Browse metrics list.
 */
export async function verifyMetric(page: Page, name: string) {
  await metricsTable(page).getByText(name, { exact: true }).click();
  await expect(MetricPage.aboutPage(page)).toBeVisible();

  await MetricPage.moreMenu(page).click();
  // The verified icon updates optimistically, but the POST /api/moderation-review
  // is still in flight — navigating away (below) before it lands leaves the
  // metric unverified on refetch, so the verified-filter never engages. Anchor
  // on the write, not the optimistic icon (PORTING: "gate on the state the race
  // corrupts"). Cypress's command latency always covered this window.
  const review = waitForModerationReview(page);
  await popover(page).getByText("Verify this metric", { exact: true }).click();
  // cy.icon("verified").should("be.visible") is an ANY-match (PORTING rule 3).
  await expect(icon(page, "verified").filter({ visible: true }).first()).toBeVisible();
  await review;
  await waitForMetricVerified(page, name, true);
  await navigationSidebar(page)
    .getByRole("listitem", { name: "Browse metrics", exact: true })
    .click();
}

/** Port of the spec-local unverifyMetric. */
export async function unverifyMetric(page: Page, name: string) {
  await metricsTable(page).getByText(name, { exact: true }).click();
  await expect(MetricPage.aboutPage(page)).toBeVisible();

  await MetricPage.moreMenu(page).click();
  const review = waitForModerationReview(page);
  await popover(page).getByText("Remove verification", { exact: true }).click();
  await expect(icon(page, "verified")).toHaveCount(0);
  await review;
  await waitForMetricVerified(page, name, false);
  await navigationSidebar(page)
    .getByRole("listitem", { name: "Browse metrics", exact: true })
    .click();
}

/** Resolve on the POST /api/moderation-review the verify/unverify action fires. */
function waitForModerationReview(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/moderation-review",
  );
}

/**
 * The Browse > Metrics page is entirely /api/search-backed and the FE fires a
 * SINGLE refetch when it remounts (RTK invalidates on the mutation, then caches
 * the result and never refetches again). `restore()`'s force-reindex is async,
 * so a mutation issued moments after restore (verify, unverify, restore-from-
 * trash) can land while the index is still settling: the FE's one refetch reads
 * the stale index and the page is permanently wrong. Poll the backend (same
 * pattern as fixtures.restore()'s own index-readiness poll) until the index
 * reflects the change BEFORE triggering the FE read — the settle is fast in
 * isolation but races the immediate post-restore refetch. Verified against the
 * jar: the backend reflects moderation synchronously; only the reindex-settle
 * timing bites.
 */
async function metricSearchItem(page: Page, name: string) {
  const response = await page.request.get(
    "/api/search?models=metric&context=browse&filter_items_in_personal_collection=exclude&model_ancestors=false",
  );
  const body = (await response.json()) as {
    data?: { name: string; moderated_status: string | null }[];
  };
  return (body.data ?? []).find((item) => item.name === name);
}

/** Poll until the metric's search-index verified status settles. */
export async function waitForMetricVerified(
  page: Page,
  name: string,
  verified: boolean,
) {
  await expect
    .poll(async () => (await metricSearchItem(page, name))?.moderated_status ?? null, {
      timeout: 15_000,
    })
    .toBe(verified ? "verified" : null);
}

/** Poll until the metric is present in the search-backed browse list. */
export async function waitForMetricSearchable(page: Page, name: string) {
  await expect
    .poll(async () => Boolean(await metricSearchItem(page, name)), {
      timeout: 15_000,
    })
    .toBe(true);
}

/** Port of the spec-local toggleVerifiedMetricsFilter. */
export async function toggleVerifiedMetricsFilter(page: Page) {
  await page.getByLabel(/show.*verified.*metrics/i).click();
}

/**
 * Port of the Cypress `cy.on("window:before:load", win => cy.stub(win, "open"))`
 * spy: replace window.open with a recorder BEFORE the page loads, so alt/meta
 * clicks that open a new tab are captured instead of spawning a real one.
 * Call before page.goto (addInitScript runs on every navigation).
 */
export async function spyOnWindowOpen(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __openCalls: string[][] }).__openCalls = [];
    window.open = ((...args: unknown[]) => {
      (window as unknown as { __openCalls: string[][] }).__openCalls.push(
        args.map((arg) => String(arg)),
      );
      return null;
    }) as typeof window.open;
  });
}

/** The window.open calls recorded by spyOnWindowOpen, as [url, target, ...]. */
export function getWindowOpenCalls(page: Page): Promise<string[][]> {
  return page.evaluate(
    () => (window as unknown as { __openCalls?: string[][] }).__openCalls ?? [],
  );
}

/**
 * Port of the Cypress `cy.intercept("GET", "/api/session/properties", …)` that
 * rewrites `browse-filter-only-verified-metrics` in the response body. The
 * endpoint is always GET, so no method branch is needed.
 */
export async function forceVerifiedMetricsSessionProperty(
  page: Page,
  value: boolean,
) {
  await page.route("**/api/session/properties", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body["browse-filter-only-verified-metrics"] = value;
    await route.fulfill({ response, json: body });
  });
}

/** Assert the ellipsified markdown cell truncates (metricsTable helper). */
export async function assertMetricDescriptionEllipsified(
  page: Page,
  matcher: RegExp,
) {
  const cell = metricsTable(page).getByText(matcher).first();
  await expect(cell).toBeVisible();
  await assertIsEllipsified(cell);
  await cell.hover();
}
