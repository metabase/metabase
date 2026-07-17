/**
 * Search helpers — ports of e2e/support/helpers/e2e-search-helpers.js,
 * H.visitFullAppEmbeddingUrl (e2e-embedding-helpers.js) and the overflow
 * assertions from e2e-ui-elements-overflow-helpers.js.
 */
import { expect } from "@playwright/test";
import type {
  Frame,
  FrameLocator,
  Locator,
  Page,
  Response,
} from "@playwright/test";

import type { MetabaseApi } from "./api";
import { icon } from "./dashboard-cards";
import { BASE_URL } from "./env";
import { SAMPLE_DB_ID } from "./sample-data";

/** Port of H.getSearchBar. */
export function getSearchBar(scope: Page | FrameLocator): Locator {
  return scope.getByPlaceholder("Search…");
}

/**
 * Port of H.visitFullAppEmbeddingUrl. The frontend only activates full-app
 * embedding mode when it runs inside an iframe: Cypress tests are in one by
 * architecture (the upstream helper just deletes `window.Cypress` so the app
 * stops opting out), but Playwright pages are top-level, so the app is loaded
 * into a real iframe here. All app interactions must go through the returned
 * FrameLocator; network waits/routes stay on the page, and the session cookie
 * is same-site so it flows into the iframe.
 */
export async function visitFullAppEmbeddingUrl(
  page: Page,
  {
    url,
    qs,
  }: { url: string; qs: Record<string, string | number | boolean> },
): Promise<FrameLocator> {
  // The backend sends X-Frame-Options: DENY and frame-ancestors 'none';
  // Cypress's proxy strips those headers, so do the same for the iframe's
  // document requests (bypassCSP covers the rest of the CSP).
  await page.route(
    (routeUrl) => routeUrl.href.startsWith(BASE_URL),
    async (route) => {
      if (route.request().resourceType() !== "document") {
        return route.fallback();
      }
      const response = await route.fetch();
      const headers = { ...response.headers() };
      delete headers["x-frame-options"];
      delete headers["content-security-policy"];
      await route.fulfill({ response, headers });
    },
  );
  const params = new URLSearchParams(
    Object.entries(qs).map(([key, value]) => [key, String(value)]),
  );
  await page.setContent(
    `<iframe id="embed" name="embed" src="${BASE_URL}${url}?${params.toString()}" style="width:100%;height:100vh;border:0"></iframe>`,
  );
  return page.frameLocator("#embed");
}

/** The Frame behind visitFullAppEmbeddingUrl, for URL assertions. */
export function embedFrame(page: Page): Frame {
  const frame = page.frame("embed");
  if (!frame) {
    throw new Error("embed iframe not found — call visitFullAppEmbeddingUrl first");
  }
  return frame;
}

/** Matches the Cypress `cy.intercept("GET", "/api/search?q=*")` pattern. */
export function isSearchRequest(url: string, method: string): boolean {
  const parsed = new URL(url);
  return (
    method === "GET" &&
    parsed.pathname === "/api/search" &&
    parsed.searchParams.has("q")
  );
}

export function waitForSearchResponse(page: Page): Promise<Response> {
  return page.waitForResponse((response) =>
    isSearchRequest(response.url(), response.request().method()),
  );
}

type ExpectedSearchResult = {
  name: string | RegExp;
  description?: string;
  collection?: string;
  timestamp?: string;
  icon?: string;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Port of H.expectSearchResultContent.
 *
 * Note: the upstream collection check passes a callback to jQuery's
 * `.first()`, which ignores it — the assertion never ran in Cypress. It is
 * ported here as a real assertion against the result's link wrappers.
 */
export async function expectSearchResultContent(
  scope: Page | FrameLocator,
  {
    expectedSearchResults,
    strict = true,
  }: { expectedSearchResults: ExpectedSearchResult[]; strict?: boolean },
) {
  const searchResultItems = scope.getByTestId("search-result-item");

  if (strict) {
    await expect(searchResultItems).toHaveCount(expectedSearchResults.length);
  }

  for (const expected of expectedSearchResults) {
    // cy.contains is case-sensitive; string names become case-sensitive
    // regexes so filter({ hasText }) matches with the same semantics.
    const nameMatcher =
      expected.name instanceof RegExp
        ? expected.name
        : new RegExp(escapeRegExp(expected.name));
    // cy.contains picks the first matching element.
    const item = searchResultItems.filter({ hasText: nameMatcher }).first();

    await expect(
      item.getByTestId("search-result-item-name").getByText(nameMatcher),
    ).toBeVisible();

    if (expected.description) {
      await expect(
        item
          .getByTestId("result-description")
          .getByText(expected.description, { exact: true }),
      ).toBeVisible();
    }

    if (expected.collection) {
      await expect(
        item
          .getByTestId("result-link-wrapper")
          .getByText(expected.collection, { exact: true })
          .first(),
      ).toBeVisible();
    }

    if (expected.timestamp) {
      await expect(
        item
          .getByTestId("revision-history-text")
          .getByText(expected.timestamp, { exact: true }),
      ).toBeVisible();
    }

    if (expected.icon) {
      await expect(icon(item, expected.icon).first()).toBeVisible();
    }
  }
}

/** Port of H.assertIsEllipsified (isEllipsified evaluated in the browser). */
export async function assertIsEllipsified(locator: Locator) {
  const isEllipsified = await locator.evaluate((element) => {
    // Skip axes that don't clip; `overflow-y: visible` elements report
    // scrollHeight > clientHeight without being truncated.
    const { overflowX, overflowY } = window.getComputedStyle(element);
    const verticalClips = overflowY !== "visible";
    const horizontalClips = overflowX !== "visible";
    return (
      (verticalClips && element.scrollHeight > element.clientHeight) ||
      (horizontalClips && element.scrollWidth > element.clientWidth)
    );
  });
  expect(isEllipsified, "is ellipsified").toBe(true);
}

/** Port of H.isScrollableHorizontally. */
export function isScrollableHorizontally(locator: Locator): Promise<boolean> {
  return locator.evaluate((element: HTMLElement) => {
    const { clientHeight, offsetHeight } = element;
    const style = window.getComputedStyle(element);
    const borderTopWidth = parseInt(style.borderTopWidth, 10);
    const borderBottomWidth = parseInt(style.borderBottomWidth, 10);
    const borderWidth = borderTopWidth + borderBottomWidth;
    const horizontalScrollbarHeight = offsetHeight - clientHeight - borderWidth;
    return horizontalScrollbarHeight > 0;
  });
}

/**
 * Port of H.createQuestion for details the spike's api.createQuestion doesn't
 * accept (description).
 */
export async function createQuestionWithDescription(
  api: MetabaseApi,
  details: {
    name: string;
    query: Record<string, unknown>;
    description?: string;
    type?: string;
    display?: string;
    collection_id?: number;
    database?: number;
  },
): Promise<{ id: number }> {
  const {
    name,
    type = "question",
    display = "table",
    database = SAMPLE_DB_ID,
    query,
    ...rest
  } = details;
  const response = await api.post("/api/card", {
    name,
    type,
    display,
    visualization_settings: {},
    ...rest,
    dataset_query: { type: "query", query, database },
  });
  return (await response.json()) as { id: number };
}

/** Port of H.createCollection. */
export async function createCollection(
  api: MetabaseApi,
  details: { name: string; description?: string; parent_id?: number | null },
): Promise<{ id: number }> {
  const response = await api.post("/api/collection", details);
  return (await response.json()) as { id: number };
}
