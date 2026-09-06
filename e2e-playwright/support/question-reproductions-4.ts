/**
 * Spec-local helpers for the Playwright port of
 * e2e/test/scenarios/question-reproductions/reproductions-4.cy.spec.js.
 *
 * Lives in its own module so the shared support files stay untouched
 * (PORTING.md rule 9).
 */
import { expect } from "@playwright/test";
import type { Locator, Page, Response } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { formatExpression } from "./custom-column-3";
import { enterCustomColumnDetails } from "./notebook";

export const QA_DB_SKIP_REASON =
  "Requires the QA Postgres container and its postgres-12 snapshot (set PW_QA_DB_ENABLED)";

// === response waits (the spec's cy.intercept + cy.wait aliases) ===

/** POST /api/dataset — the "@dataset" alias. */
export function waitForDataset(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/dataset",
  );
}

/** POST /api/card/:id/query — the "@cardQuery" alias. */
export function waitForCardQuery(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /^\/api\/card\/\d+\/query$/.test(new URL(response.url()).pathname),
  );
}

/** PUT /api/card/:id — the "@updateCard" alias. */
export function waitForUpdateCard(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      /^\/api\/card\/\d+$/.test(new URL(response.url()).pathname),
  );
}

/** POST /api/card — the "@createQuestion" alias. */
export function waitForCreateCard(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/card",
  );
}

/**
 * `H.visualize()` for a question that may already be SAVED. The shared
 * notebook.ts `visualize` waits strictly on POST /api/dataset, which is right
 * for ad-hoc questions; a saved card whose notebook has been edited runs
 * ad-hoc, but an unmodified one re-runs through POST /api/card/:id/query
 * (the documented saved-vs-ad-hoc endpoint split). Waits for either.
 */
export async function visualizeEitherEndpoint(page: Page) {
  const query = page.waitForResponse((response) => {
    if (response.request().method() !== "POST") {
      return false;
    }
    const { pathname } = new URL(response.url());
    return (
      pathname === "/api/dataset" || /^\/api\/card\/\d+\/query$/.test(pathname)
    );
  });
  await page.getByRole("button", { name: "Visualize", exact: true }).click();
  return query;
}

/**
 * `cy.intercept(...).as(x)` + `cy.wait("@x")` counts responses that arrived
 * since the intercept was registered — including ones that landed before the
 * wait was issued. `page.waitForResponse` only sees the future, so aliases
 * that are awaited N-at-a-time after several triggering actions need a
 * counter registered at the same point the Cypress intercept was.
 */
export function responseCounter(
  page: Page,
  predicate: (response: Response) => boolean,
) {
  const seen: Response[] = [];
  const listener = (response: Response) => {
    if (predicate(response)) {
      seen.push(response);
    }
  };
  page.on("response", listener);
  return {
    get responses() {
      return seen;
    },
    get count() {
      return seen.length;
    },
    async waitFor(n: number, timeout = 30_000) {
      await expect
        .poll(() => seen.length, { timeout })
        .toBeGreaterThanOrEqual(n);
    },
    dispose() {
      page.off("response", listener);
    },
  };
}

// === misc ports ===

/**
 * Port of H.withDatabase (e2e-database-metadata-helpers.ts): read a database's
 * metadata and build the `{ TABLE: { FIELD: id }, TABLE_ID: id }` map the
 * Cypress helper hands to its callback.
 */
export type DatabaseMap = Record<string, number | Record<string, number>>;

export async function withDatabase(
  api: MetabaseApi,
  databaseId: number,
): Promise<DatabaseMap> {
  const response = await api.get(
    `/api/database/${databaseId}/metadata?include_hidden=true`,
  );
  const body = (await response.json()) as {
    tables?: { id: number; name: string; fields?: { id: number; name: string }[] }[];
  };
  const database: DatabaseMap = {};
  for (const table of body.tables ?? []) {
    const fields: Record<string, number> = {};
    for (const field of table.fields ?? []) {
      fields[field.name.toUpperCase()] = field.id;
    }
    database[table.name.toUpperCase()] = fields;
    database[`${table.name.toUpperCase()}_ID`] = table.id;
  }
  return database;
}

/**
 * Port of `H.enterCustomColumnDetails({ formula, name, format: true })`.
 * The shared notebook.ts helper has no `format` option, and upstream's order
 * matters: type → blur → format → name (e2e-custom-column-helpers.ts).
 */
export async function enterCustomColumnDetailsFormatted(
  page: Page,
  { formula, name }: { formula: string; name?: string },
) {
  await enterCustomColumnDetails(page, { formula });
  await formatExpression(page);
  if (name) {
    const nameInput = page.getByTestId("expression-name");
    await nameInput.fill(name);
    await nameInput.blur();
  }
}

/**
 * Port of the spec-local `expectNoScrollbarContainer(element)`:
 *   scrollHeight <= clientHeight && offsetWidth > clientWidth  →  must be false
 * i.e. the element must not reserve gutter width for a scrollbar it doesn't
 * need. Read inside a single evaluate so a re-render can't split the reads.
 */
export async function expectNoScrollbarContainer(locator: Locator) {
  const hasScrollbarContainer = await locator.evaluate((el: HTMLElement) => {
    return el.scrollHeight <= el.clientHeight && el.offsetWidth > el.clientWidth;
  });
  expect(hasScrollbarContainer).toBe(false);
}

/** Port of the spec-local `assertEqualHeight` (jQuery `.outerHeight()`). */
export async function assertEqualHeight(a: Locator, b: Locator) {
  const [heightA, heightB] = await Promise.all([
    a.evaluate((el: HTMLElement) => el.getBoundingClientRect().height),
    b.evaluate((el: HTMLElement) => el.getBoundingClientRect().height),
  ]);
  expect(heightB).toBe(heightA);
}

/**
 * Cypress's `should("not.be.visible")` requires the element to EXIST and be
 * invisible, and it counts `opacity: 0` (on the element or any ancestor) as
 * hidden — Playwright's `toBeHidden` does neither (it passes on a detached
 * element and ignores opacity). This is the faithful equivalent.
 */
export async function expectCypressHidden(locator: Locator) {
  await expect(locator).toBeAttached();
  await expect
    .poll(() =>
      locator.evaluate((el: HTMLElement) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          return true;
        }
        let node: HTMLElement | null = el;
        while (node) {
          const style = getComputedStyle(node);
          if (
            style.display === "none" ||
            style.visibility === "hidden" ||
            Number(style.opacity) === 0
          ) {
            return true;
          }
          node = node.parentElement;
        }
        return false;
      }),
    )
    .toBe(true);
}

/** Computed `z-index` of an element, as a number (NaN when `auto`). */
export function zIndexOf(locator: Locator): Promise<number> {
  return locator.evaluate((el: HTMLElement) =>
    parseInt(getComputedStyle(el).zIndex, 10),
  );
}
