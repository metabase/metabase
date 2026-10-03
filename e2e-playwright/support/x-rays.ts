/**
 * Helpers for the x-rays spec port
 * (e2e/test/scenarios/dashboard/x-rays.cy.spec.js).
 *
 * X-ray = automagic dashboards: clicking "X-ray this" on a table/field/value
 * lands you on a generated dashboard whose every dashcard fires its own
 * /api/dataset (or /api/automagic-dashboards) query. The counting waits below
 * mirror the upstream `cy.wait(Array(n).fill("@dataset"))` pattern (rule 2):
 * register BEFORE the triggering navigation/click, await after.
 *
 * Lives in its own module (PORTING.md rule 9); everything else is imported
 * read-only from the shared support files.
 */
import type { Locator, Page, Response } from "@playwright/test";

import { dashboardGrid } from "./drillthroughs";

/**
 * Port of the spec-local getDashcardByTitle: the dashcard in the dashboard
 * grid that contains `title` (findByText is exact → getByText exact). Cypress
 * used `.closest("[data-testid='dashcard']")`; the filter form is equivalent.
 */
export function getDashcardByTitle(page: Page, title: string): Locator {
  return dashboardGrid(page)
    .getByTestId("dashcard")
    .filter({ has: page.getByText(title, { exact: true }) });
}

/**
 * Resolve after `count` POST /api/dataset responses (the "@dataset" /
 * "@postDataset" alias in the original). Single counting predicate so all
 * responses are seen sequentially — registering N independent waitForResponse
 * promises would all resolve on the FIRST response. Register before the
 * trigger, await after.
 */
export function waitForDatasetResponses(
  page: Page,
  count: number,
  { timeout }: { timeout?: number } = {},
): Promise<void> {
  let seen = 0;
  return page
    .waitForResponse((response) => {
      if (
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/api/dataset"
      ) {
        seen += 1;
      }
      return seen >= count;
    }, timeout != null ? { timeout } : undefined)
    .then(() => undefined);
}

/**
 * Port of the spec's `waitForSatisfyingResponse("@ordersDataset", { body:
 * { data: { rows: [[18760]] } } }, N)`: wait for the /api/dataset response
 * whose body rows equal `[[18760]]`. The recursive Cypress retry loop with a
 * max-request guard becomes a single async predicate bounded by the action
 * timeout.
 */
export function waitForDatasetWithRows(
  page: Page,
  rows: unknown[][],
  { timeout }: { timeout?: number } = {},
): Promise<Response> {
  const want = JSON.stringify(rows);
  return page.waitForResponse(async (response) => {
    if (
      response.request().method() !== "POST" ||
      new URL(response.url()).pathname !== "/api/dataset"
    ) {
      return false;
    }
    try {
      const body = (await response.json()) as {
        data?: { rows?: unknown[][] };
      };
      return JSON.stringify(body?.data?.rows) === want;
    } catch {
      return false;
    }
  }, timeout != null ? { timeout } : undefined);
}

/** Register a wait for the automagic-dashboards GET the drill fires. */
export function waitForXray(page: Page): Promise<Response> {
  return page.waitForResponse((response) =>
    new URL(response.url()).pathname.startsWith("/api/automagic-dashboards/"),
  );
}

/** Register a wait for the built-in geojson map asset the choropleth card
 * loads (`GET /app/assets/geojson/**`). */
export function waitForGeojson(
  page: Page,
  { timeout }: { timeout?: number } = {},
): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.startsWith("/app/assets/geojson/"),
    timeout != null ? { timeout } : undefined,
  );
}
