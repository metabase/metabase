/**
 * Helpers for e2e/test/scenarios/search/search-pagination.cy.spec.js.
 *
 * The spec drives the full-page search app's pagination controls. Everything
 * else it needs (the command-palette locators, the createQuestion factory,
 * popover) is imported read-only from the shared modules; only the viewAll
 * variant of commandPaletteSearch lives here.
 */
import type { Page, Response } from "@playwright/test";

import type { MetabaseApi } from "./api";
import {
  commandPalette,
  commandPaletteButton,
  commandPaletteInput,
} from "./command-palette";

/** GET /api/search?q=* (the palette/search-app query). */
function isSearchRequest(url: string, method: string): boolean {
  const parsed = new URL(url);
  return (
    method === "GET" &&
    parsed.pathname === "/api/search" &&
    parsed.searchParams.has("q")
  );
}

/** Register a wait for the next /api/search response (PORTING rule 2 —
 * register BEFORE the triggering action, await after). */
export function waitForSearch(page: Page): Promise<Response> {
  return page.waitForResponse((response) =>
    isSearchRequest(response.url(), response.request().method()),
  );
}

/**
 * The seeded `generated_question` cards are indexed asynchronously after a
 * snapshot restore; mb.restore()'s readiness poll only guarantees a *table*
 * is searchable, so a card search fired too early can return fewer than the
 * full set (the FE renders that count and never re-queries). Poll the search
 * endpoint (nudging a force-reindex once) until at least `minCount` cards for
 * `query` are indexed.
 */
export async function waitForCardsIndexed(
  api: MetabaseApi,
  query: string,
  minCount: number,
) {
  const deadline = Date.now() + 30_000;
  let forcedReindex = false;
  while (Date.now() < deadline) {
    const response = await api.get(
      `/api/search?q=${encodeURIComponent(query)}&models=card&limit=100`,
      { failOnStatusCode: false },
    );
    if (response.ok()) {
      const body = await response.json().catch(() => ({ data: [] }));
      if ((body.data ?? []).length >= minCount) {
        return;
      }
    }
    if (!forcedReindex) {
      forcedReindex = true;
      await api.post("/api/search/force-reindex", undefined, {
        failOnStatusCode: false,
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/**
 * Port of H.commandPaletteSearch(query) with its default viewAll = true:
 * open the palette, type the query, wait for the palette search, then click
 * "View and filter all results" — which navigates to the full-page search
 * app where the pagination controls live.
 */
export async function commandPaletteSearch(page: Page, query: string) {
  await commandPaletteButton(page).click();
  const search = waitForSearch(page);
  await commandPaletteInput(page).fill("");
  await commandPaletteInput(page).pressSequentially(query);
  await search;
  await commandPalette(page)
    .getByRole("link", { name: /View and filter/ })
    .click();
}
