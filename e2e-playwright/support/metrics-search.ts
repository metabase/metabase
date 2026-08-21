/**
 * Helpers for e2e/test/scenarios/metrics/metrics-search.cy.spec.js.
 *
 * The only helper this spec needs beyond the shared command-palette locators
 * (imported read-only) is the viewAll-parameterised commandPaletteSearch —
 * the shared search-pagination.ts version hard-codes viewAll = true, but this
 * spec drives both branches (in-palette results vs the full search page).
 */
import type { Page, Response } from "@playwright/test";

import {
  commandPalette,
  commandPaletteButton,
  commandPaletteInput,
} from "./command-palette";

/** GET /api/search?q=* — the palette/search-app query the spec's `@search`
 * alias matches. */
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
 * Port of H.commandPaletteSearch(query, viewAll = true): open the palette,
 * type the query (real keystrokes so debounce/search fires), wait for the
 * palette search. When viewAll, click "View and filter all results" and wait
 * for the search the navigation to the full-page search app fires.
 *
 * Upstream's `.clear().type()` → fill("") + pressSequentially (the search box
 * depends on debounce, so real keystrokes, not fill()).
 */
export async function commandPaletteSearch(
  page: Page,
  query: string,
  viewAll = true,
) {
  await commandPaletteButton(page).click();
  const paletteSearch = waitForSearch(page);
  await commandPaletteInput(page).fill("");
  await commandPaletteInput(page).pressSequentially(query);
  await paletteSearch;

  if (viewAll) {
    const navSearch = waitForSearch(page);
    await commandPalette(page)
      .getByRole("link", { name: /View and filter/ })
      .click();
    await navSearch;
  }
}
