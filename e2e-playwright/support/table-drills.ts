/**
 * Helpers for the table_drills port
 * (e2e/test/scenarios/visualizations-tabular/drillthroughs/table_drills.cy.spec.js).
 * Lives in its own file so shared support modules stay untouched
 * (PORTING.md rule 9); read-only imports from the shared modules.
 */
import type { Page } from "@playwright/test";

import { expect } from "./fixtures";
import { visitQuestionAdhoc } from "./permissions";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "./sample-data";
import { icon } from "./ui";

const { REVIEWS_ID } = SAMPLE_DATABASE;

/**
 * Port of the spec's `cy.intercept("/api/session/properties", ...)` that
 * overwrites `token-features.development_mode`. Fetches the real response and
 * mutates the nested field (native fetch, mirroring admin-extras
 * mockSessionProperty — route.fetch chokes on the backend's set-cookie headers
 * under bun). Register before the navigation that triggers it.
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
        "token-features"?: Record<string, unknown>;
      };
      if (body["token-features"]) {
        body["token-features"].development_mode = devMode;
      }
      await route.fulfill({
        status: response.status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    },
  );
}

/**
 * Port of H.openTable (e2e-ad-hoc-question-helpers.js) for the `limit` cases
 * this spec needs — open a table as an ad-hoc simple-mode question with a row
 * limit. The shared binning.ts openTable drops `limit`, so it's re-derived here.
 */
export async function openTable(
  page: Page,
  { table, limit }: { table: number; limit?: number },
) {
  await visitQuestionAdhoc(page, {
    dataset_query: {
      database: SAMPLE_DB_ID,
      query: { "source-table": table, ...(limit != null ? { limit } : {}) },
      type: "query",
    },
  });
}

/** Port of H.openReviewsTable ({ table: REVIEWS_ID, ...}). */
export async function openReviewsTable(
  page: Page,
  { limit }: { limit?: number } = {},
) {
  await openTable(page, { table: REVIEWS_ID, limit });
}

/**
 * `cy.icon(name).should("be.visible")` is an ANY-match (PORTING.md rule 3 /
 * wave-9 note) — assert that at least one instance in `scope` is visible.
 */
export async function expectIconVisible(page: Page, scope: string, name: string) {
  await expect(
    icon(page.getByTestId(scope), name)
      .filter({ visible: true })
      .first(),
  ).toBeVisible();
}
