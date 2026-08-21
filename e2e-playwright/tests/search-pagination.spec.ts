/**
 * Playwright port of e2e/test/scenarios/search/search-pagination.cy.spec.js
 *
 * Notes:
 * - "should not search on an empty string" runs full-app embedding
 *   (visitFullAppEmbeddingUrl in support/search.ts). Upstream registers a
 *   blanket cy.intercept("/api/search") whose handler fails the test if it
 *   ever runs; ported as a page-level request listener asserted empty at the
 *   end (typing whitespace must not trigger a search).
 * - The "multiple pages of results" describe seeds 51 questions once (the
 *   Cypress before()) into a "many-questions" snapshot — here built once per
 *   worker (each worker owns its backend) and restored in beforeEach, same as
 *   upstream. A readiness poll (waitForCardsIndexed) covers the async card
 *   indexing that mb.restore()'s table-only poll doesn't.
 * - commandPaletteSearch (support/search-pagination.ts) ports the upstream
 *   default viewAll = true: it clicks "View and filter all results", landing
 *   on the full-page search app where the pagination controls live.
 * - Pagination clicks and the /search?q= navigation each fire a fresh
 *   /api/search; waits are registered before the trigger (PORTING rule 2).
 */
import { test, expect } from "../support/fixtures";
import { createQuestion } from "../support/factories";
import { SAMPLE_DATABASE } from "../support/sample-data";
import {
  getSearchBar,
  visitFullAppEmbeddingUrl,
} from "../support/search";
import {
  commandPaletteSearch,
  waitForCardsIndexed,
  waitForSearch,
} from "../support/search-pagination";
import { popover } from "../support/ui";

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

const PAGE_SIZE = 50;
const TOTAL_ITEMS = PAGE_SIZE + 1;

const SNAPSHOT_NAME = "many-questions";

test.describe("scenarios > search", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore();
    await mb.signInAsAdmin();
  });

  test("should not search on an empty string", async ({ page, mb }) => {
    // Upstream fails on ANY /api/search, but the app fires a query-less
    // `context=basic-actions` prefetch on load (no user search); the test is
    // about typing, so count only search-on-string requests (those with `q`).
    const searchRequests: string[] = [];
    page.on("request", (request) => {
      const parsed = new URL(request.url());
      if (parsed.pathname === "/api/search" && parsed.searchParams.has("q")) {
        searchRequests.push(request.url());
      }
    });

    const embed = await visitFullAppEmbeddingUrl(page, {
      url: "/",
      baseUrl: mb.baseUrl,
      qs: { top_nav: true, search: true },
    });
    await getSearchBar(embed).pressSequentially(" ");

    // Give any debounced search a chance to fire before asserting it didn't.
    await page.waitForTimeout(1000);
    expect(searchRequests).toHaveLength(0);
  });

  test.describe("multiple pages of results", () => {
    // The Cypress before(): seed the snapshot once. Each worker owns its
    // backend, so a module-level flag builds it once per worker.
    let snapshotReady = false;

    test.beforeEach(async ({ mb }) => {
      if (!snapshotReady) {
        // The outer beforeEach already restored default + signed in admin.
        for (let i = 0; i < TOTAL_ITEMS; i++) {
          await createQuestion(mb.api, {
            name: `generated_question ${i}`,
            query: {
              "source-table": ORDERS_ID,
              aggregation: [["count"]],
              breakout: [
                ["field", ORDERS.CREATED_AT, { "temporal-unit": "hour-of-day" }],
              ],
            },
          });
        }
        await mb.api.snapshot(SNAPSHOT_NAME);
        snapshotReady = true;
      }

      await mb.restore(SNAPSHOT_NAME);
      await mb.signInAsAdmin();
      await waitForCardsIndexed(mb.api, "generated_question", TOTAL_ITEMS);
    });

    test("should allow users to paginate results", async ({ page }) => {
      await page.goto("/");
      await commandPaletteSearch(page, "generated_question");
      await expect(page.getByLabel("Previous page", { exact: true })).toBeDisabled();

      // First page
      // The range span is mixed-content ("1 - 50 of 51" with nested spans), so
      // an exact getByText can't match; scope to the pagination nav + substring.
      await expect(
        page.getByLabel("pagination").getByText(new RegExp(`1 - ${PAGE_SIZE}`)),
      ).toBeVisible();
      await expect(page.getByTestId("pagination-total")).toHaveText(
        String(TOTAL_ITEMS),
      );
      await expect(page.getByTestId("search-result-item")).toHaveCount(
        PAGE_SIZE,
      );

      // No search wait on page changes: the following auto-retrying
      // assertions settle once the page re-renders (as upstream relied on),
      // and returning to a cached page fires no request at all.
      await page.getByLabel("Next page", { exact: true }).click();

      // Second page
      await expect(
        page
          .getByLabel("pagination")
          .getByText(new RegExp(`${PAGE_SIZE + 1} - ${TOTAL_ITEMS}`)),
      ).toBeVisible();
      await expect(page.getByTestId("pagination-total")).toHaveText(
        String(TOTAL_ITEMS),
      );
      await expect(page.getByTestId("search-result-item")).toHaveCount(1);
      await expect(page.getByLabel("Next page", { exact: true })).toBeDisabled();

      await page.getByLabel("Previous page", { exact: true }).click();

      // First page
      // The range span is mixed-content ("1 - 50 of 51" with nested spans), so
      // an exact getByText can't match; scope to the pagination nav + substring.
      await expect(
        page.getByLabel("pagination").getByText(new RegExp(`1 - ${PAGE_SIZE}`)),
      ).toBeVisible();
      await expect(page.getByTestId("pagination-total")).toHaveText(
        String(TOTAL_ITEMS),
      );
      await expect(page.getByTestId("search-result-item")).toHaveCount(
        PAGE_SIZE,
      );
    });

    test("should reset the page when filters change (metabase#65501)", async ({
      page,
    }) => {
      const initialSearch = waitForSearch(page);
      await page.goto("/search?q=");
      await initialSearch;

      const nextSearch = waitForSearch(page);
      await page.getByLabel("Next page", { exact: true }).click();
      await nextSearch;

      await page.getByTestId("type-search-filter").click();
      await popover(page).getByText("Table", { exact: true }).click();

      const filterSearch = waitForSearch(page);
      await popover(page).getByText("Apply", { exact: true }).click();
      await filterSearch;

      await expect(
        page
          .getByTestId("search-app")
          .getByText("Didn't find anything", { exact: true }),
      ).toHaveCount(0);
      await expect(page.getByTestId("search-result-item").first()).toBeVisible();
    });
  });
});
