/**
 * Helpers for the admin-databases spec (port of
 * e2e/test/scenarios/admin/databases.cy.spec.js and the two helpers it imports
 * from e2e/test/scenarios/admin/helpers/e2e-database-helpers.js).
 *
 * NOTE ON THE SOURCE FILE (collision check): the upstream directory also holds
 * `e2e/test/scenarios/admin/databases/` (a directory, containing
 * database-writable-connection.cy.spec.ts) and `database-connection-strings.cy.spec.ts`.
 * Those are different specs. The port here is of the top-level
 * `databases.cy.spec.js` only.
 */
import { expect } from "@playwright/test";
import type { Locator, Page, Response } from "@playwright/test";

import { escapeRegExp } from "./text";
import { icon, popover } from "./ui";

/** Mirrors e2e/support/cypress_data.js. */
export const SAMPLE_DB_ID = 1;
export const WRITABLE_DB_ID = 2;
export const QA_MYSQL_PORT = 3304;
export const QA_MONGO_PORT = 27004;
export const QA_POSTGRES_PORT = 5404;

/**
 * The database Metabase's database 2 points at after a `-writable` restore.
 * Not a constant any more: with per-worker isolation on, `restore()` re-points
 * database 2 at this worker's own `writable_db_w<slot>` (support/writable-db.ts),
 * and a test asserting the literal `writable_db` would fail for the right
 * reason but the wrong cause.
 */
export { writableDbName } from "./writable-db";

/**
 * Port of `cy.button(name)` (e2e/support/commands/ui/button.ts):
 * `findByRole("button", { name })`. testing-library's string `name` is an
 * EXACT accessible-name match, so `exact: true` (PORTING rule 1). A RegExp
 * `name` is passed through unchanged.
 */
export function button(scope: Page | Locator, name: string | RegExp): Locator {
  return typeof name === "string"
    ? scope.getByRole("button", { name, exact: true })
    : scope.getByRole("button", { name });
}

/**
 * Port of H.typeAndBlurUsingLabel (e2e-misc-helpers.js):
 * `cy.findByLabelText(label).clear().type(value).blur()`.
 *
 * Deliberately NOT reusing `database-routing-admin.typeAndBlurUsingLabel`:
 * that copy calls `getByLabel(label)` with no `exact`, and PORTING records
 * that `findByLabelText` is EXACT while `getByLabel` is a SUBSTRING match. On
 * this form the difference is load-bearing — "Port" is a substring of
 * "Additional JDBC connection string options"-adjacent labels on some engines,
 * and "Database name" of "Database name (optional)". String labels therefore
 * get `{ exact: true }`; regex labels are passed through.
 *
 * `fill()` performs clear-then-type in one step, matching `.clear().type()`.
 * The element is captured ONCE and re-used for the blur — re-resolving a
 * label-based locator after typing is the placeholder trap (PORTING).
 */
export async function typeAndBlurUsingLabel(
  scope: Page | Locator,
  label: string | RegExp,
  value: string,
) {
  const field = labeled(scope, label);
  await field.click();
  await field.fill(value);
  await field.blur();
}

/** `findByLabelText` semantics: exact for strings, regex passed through. */
export function labeled(
  scope: Page | Locator,
  label: string | RegExp,
): Locator {
  return typeof label === "string"
    ? scope.getByLabel(label, { exact: true })
    : scope.getByLabel(label);
}

/** Port of the spec-local `toggleFieldWithDisplayName`:
 * `cy.findByLabelText(new RegExp(displayName)).click({ force: true })`.
 * Cypress's `{force:true}` DISPATCHES at the resolved element; Playwright's
 * moves the real mouse and hits whatever is topmost (PORTING), so the faithful
 * equivalent for these visually-hidden Mantine Switch inputs is dispatchEvent. */
export async function toggleFieldWithDisplayName(
  scope: Page | Locator,
  displayName: string,
) {
  await scope.getByLabel(new RegExp(displayName)).dispatchEvent("click");
}

/** Port of the spec-local `selectFieldOption(fieldName, option)`:
 * `cy.findByLabelText(fieldName).click(); popover().contains(option).click({force:true})`.
 *
 * Every field this is used on ("Database type", "SSL Mode", "Datasets") is a
 * Mantine `FormSelect`, so the row is picked by `role="option"` and NOT by
 * clicking the text div (PORTING wave-10). `.contains(option)` is a
 * case-sensitive SUBSTRING first-match, so the row is filtered by an escaped
 * regex rather than an exact accessible name (`renderOption` injects a
 * database logo/icon into the name — PORTING). */
export async function selectFieldOption(
  page: Page,
  fieldName: string,
  option: string,
) {
  await labeled(page, fieldName).click();
  await popover(page)
    .getByRole("option")
    .filter({ hasText: new RegExp(escapeRegExp(option)) })
    .first()
    .click();
}

/** Port of the spec-local `chooseDatabase`. */
export function chooseDatabase(page: Page, database: string) {
  return selectFieldOption(page, "Database type", database);
}

/** Port of the module-level `editDatabase()` at the bottom of the spec. */
export async function editDatabase(page: Page) {
  await page
    .getByTestId("database-connection-info-section")
    .getByRole("button", { name: "Edit connection details", exact: true })
    .click();
}

/** The `info` tooltip icon inside a labelled field's input wrapper.
 * `cy.findByLabelText(X).parent().icon("info")` — the icon is the Mantine
 * TextInput `rightSection`, a sibling of the input inside the wrapper
 * (DatabaseDetailField.tsx getInputProps). */
export function fieldInfoIcon(
  scope: Page | Locator,
  label: string | RegExp,
): Locator {
  return icon(labeled(scope, label).locator(".."), "info");
}

/**
 * Port of `visitDatabase(id)` (e2e/test/scenarios/admin/helpers/e2e-database-helpers.js):
 * register the GET /api/database/:id wait BEFORE navigating (PORTING rule 2),
 * navigate, await it, and hand back the parsed body the Cypress version
 * exposed as `{ response: { body } }`.
 */
export async function visitDatabase(
  page: Page,
  id: number,
): Promise<Record<string, any>> {
  const loadDatabase = page.waitForResponse(
    (r) =>
      r.request().method() === "GET" &&
      new URL(r.url()).pathname === `/api/database/${id}`,
  );
  await page.goto(`/admin/databases/${id}`);
  const response = await loadDatabase;
  return (await response.json()) as Record<string, any>;
}

type DatabaseListBody = { data?: Array<{ initial_sync_status?: string }> };

/**
 * The faithful port of `cy.intercept(...).as(x)` + a LATER `cy.wait("@x")`.
 *
 * `cy.wait` consumes from a queue that already holds responses which landed
 * between the intercept and the wait; `page.waitForResponse` only sees the
 * future. Three places in this spec depend on that difference:
 *  - `waitForDbSync` calls `cy.wait("@getDatabases")` in a loop, so a
 *    waitForResponse loop deadlocks once the list stops being refetched;
 *  - `@usage_info` is an RTK-Query-cached read whose ONLY request fires when
 *    the page mounts (`DeleteDatabaseModal` is rendered eagerly with an
 *    `opened` prop), long before the "Remove this database" click;
 *  - the second `@loadDatabases` after `goToMainApp()` is satisfied by the
 *    refetch the DELETE already triggered.
 *
 * Registering the recorder where Cypress registers the intercept, and
 * consuming an index where it calls `cy.wait`, reproduces the original exactly
 * without an unawaited-promise timeout.
 */
export class ResponseRecorder {
  private readonly responses: Response[] = [];
  private cursor = 0;

  constructor(
    page: Page,
    method: string,
    matcher: (url: URL) => boolean,
  ) {
    page.on("response", (response: Response) => {
      if (
        response.request().method() === method &&
        matcher(new URL(response.url()))
      ) {
        this.responses.push(response);
      }
    });
  }

  /** One `cy.wait("@alias")`: the next unconsumed response. */
  async next(timeout = 30_000): Promise<Response> {
    await expect
      .poll(() => this.responses.length, { timeout })
      .toBeGreaterThan(this.cursor);
    return this.responses[this.cursor++];
  }
}

/**
 * Port of `waitForDbSync(maxRetries = 10)`: consume `@getDatabases` responses
 * until none of the listed databases is mid-initial-sync, throwing after 10.
 */
export async function waitForDbSync(
  recorder: ResponseRecorder,
  maxRetries = 10,
) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await recorder.next();
    const body = (await response
      .json()
      .catch(() => null)) as DatabaseListBody | null;
    const syncing = (body?.data ?? []).some(
      (db) => db.initial_sync_status !== "complete",
    );
    if (!syncing) {
      return;
    }
  }
  throw new Error("Timed out waiting for database sync");
}

/** `(url) => url.pathname === path` — the common recorder/route matcher. */
export const pathnameIs = (path: string) => (url: URL) =>
  url.pathname === path;

/** `(url) => regex.test(url.pathname)` — for the `/api/database/*` globs. */
export const pathnameMatches = (pattern: RegExp) => (url: URL) =>
  pattern.test(url.pathname);

/**
 * Patch a JSON response in flight — the port of
 * `cy.intercept(method, url, (req) => req.reply((res) => { …mutate res.body… }))`.
 *
 * Uses native `fetch` rather than `route.fetch()`: the latter chokes on the
 * backend's set-cookie headers under bun (same reason support/search.ts and
 * support/search-snowplow.ts proxy with fetch).
 */
export async function patchJsonResponse(
  page: Page,
  matcher: (url: URL) => boolean,
  mutate: (body: Record<string, unknown>) => void,
) {
  await page.route(
    (url) => matcher(url),
    async (route) => {
      const request = route.request();
      const upstream = await fetch(request.url(), {
        method: request.method(),
        headers: await request.allHeaders(),
        redirect: "manual",
      });
      const body = (await upstream.json()) as Record<string, unknown>;
      mutate(body);
      await route.fulfill({
        status: upstream.status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    },
  );
}

/**
 * Port of `cy.findAllByTestId(x).should("contain.text", y)` on a MULTI-element
 * subject: chai-jquery JOINS the matched elements' text, so the assertion
 * passes when `y` spans two of them (PORTING). Not `.first()`, which would
 * silently strengthen it.
 */
export async function expectConcatenatedTextToContain(
  locator: Locator,
  text: string,
) {
  await expect
    .poll(async () => (await locator.allTextContents()).join(""))
    .toContain(text);
}
