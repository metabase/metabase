/**
 * Helpers for tests/native-reproductions-js.spec.ts — the port of
 * e2e/test/scenarios/native/native-reproductions.cy.spec.**js**.
 *
 * ⚠️ NAME DEVIATION, DELIBERATE: the upstream `native/` directory holds BOTH
 * `native-reproductions.cy.spec.ts` and `native-reproductions.cy.spec.js`, and
 * they are completely disjoint specs. The `.ts` half is already ported to
 * `tests/native-reproductions.spec.ts` + `support/native-reproductions.ts`
 * (untouched by this port). This module and its spec carry the `-js` suffix so
 * neither file collides — the module name matches the spec name exactly.
 *
 * Read-only reuse from `support/native-reproductions.ts` (the `.ts` half's
 * module): `startNewNativeModel`, `triggerMouseEvent`, `clientRect`.
 *
 * Ports of:
 * - H.clearBrowserCache (e2e-browser-helpers.ts)
 * - a small request recorder for the `cy.get("@alias.all")` /
 *   `cy.spy().its("callCount")` patterns (PORTING: a retroactive `cy.wait`
 *   or a `.all` length check ports as a passive `page.on("request")` counter)
 */
import type { Page, Request } from "@playwright/test";

/**
 * Port of H.clearBrowserCache: `Cypress.automation("remote:debugger:protocol",
 * { command: "Network.clearBrowserCache" })` — i.e. a raw CDP call. Playwright
 * exposes the same protocol through a CDP session, so this is the literal
 * equivalent rather than an approximation.
 *
 * (Each Playwright test already gets a fresh browser context, so in practice
 * there is little cache to clear; the call is kept because upstream's whole
 * point in issue 34330 is that a warm autocomplete cache would suppress the
 * request the test counts.)
 */
export async function clearBrowserCache(page: Page) {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Network.clearBrowserCache");
  } finally {
    await session.detach();
  }
}

/**
 * Passive request recorder — the Playwright shape for
 * `cy.intercept(...).as("x")` followed by `cy.get("@x.all")` or a
 * `cy.spy().its("callCount")` assertion. Returns the live array of matching
 * request URLs, in order.
 *
 * `waitForRequest` is deliberately NOT used: three of the ported tests assert
 * BOTH "the first request carried this param" and "exactly one request was
 * made", which a consuming wait cannot express.
 */
export function recordRequests(
  page: Page,
  matches: (request: Request) => boolean,
): string[] {
  const urls: string[] = [];
  page.on("request", (request) => {
    if (matches(request)) {
      urls.push(request.url());
    }
  });
  return urls;
}

/** Matcher for the autocomplete endpoint of a given database. */
export function isAutocompleteRequest(request: Request, databaseId: number) {
  return (
    request.method() === "GET" &&
    new URL(request.url()).pathname ===
      `/api/database/${databaseId}/autocomplete_suggestions`
  );
}
