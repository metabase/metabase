/**
 * Spec-local helpers for the port of
 * e2e/test/scenarios/sharing/alert/alert-permissions.cy.spec.js.
 *
 * Everything reusable already exists in shared modules and is imported
 * read-only by tests/alert-permissions.spec.ts (porting rule 9 — shared
 * modules stay untouched, so anything new lands here):
 * - `setupSMTP` / `isMaildevRunning` / `notificationList` from
 *   support/onboarding-extras.ts
 * - `ORDERS_QUESTION_ID` / `ORDERS_BY_YEAR_QUESTION_ID` / `LOGIN_CACHE` from
 *   support/sample-data.ts
 * - `ORDERS_COUNT_QUESTION_ID` from support/question-management.ts
 * - `getFullName` / `ALL_USERS` from support/admin-people.ts
 * - `icon` / `modal` / `popover` / `visitQuestion` from support/ui.ts
 * - `MetabaseApi` from support/api.ts
 *
 * What lands here is the spec's own module-level helper (createBasicAlert),
 * the text matcher the port needs, and the `before()`-hook harness.
 */
import type { Browser, Locator, Page } from "@playwright/test";

import { expect } from "./fixtures";
import { MetabaseApi } from "./api";
import { ALL_USERS, getFullName } from "./admin-people";
import { LOGIN_CACHE } from "./sample-data";
import { popover } from "./ui";

export const ADMIN_FULL_NAME = getFullName(ALL_USERS.admin);
export const NORMAL_FULL_NAME = getFullName(ALL_USERS.normal);

/**
 * Substring text matcher restricted to an element's DIRECT child text nodes.
 *
 * Two independent reasons the plain Playwright matchers are wrong here:
 * - `getByText(s, { exact: true })` compares the element's FULL `textContent`,
 *   which testing-library's `getNodeText` does not — it reads only direct child
 *   text nodes. Playwright therefore also matches every ancestor.
 * - `getByText(s)` (non-exact) is a case-INSENSITIVE substring over the same
 *   full `textContent`, so it matches ancestors too and strict-mode-violates on
 *   `Created by …` (the Text, its Group, the modal body, the dialog…).
 *
 * testing-library's `{ exact: false }` is a case-insensitive substring over
 * `getNodeText`; the case-insensitivity is irrelevant for the strings this spec
 * matches (they are rendered with the same casing they are asserted with), so
 * this matcher is the faithful analogue and, unlike `getByText`, resolves to
 * exactly the one `<Text>` element that renders the creator line.
 */
export function directTextContaining(
  scope: Page | Locator,
  text: string,
): Locator {
  return scope.locator(
    `xpath=.//*[contains(normalize-space(text()), ${xpathLiteral(text)})]`,
  );
}

/** Quote a string for XPath 1.0, which has no escape syntax. */
function xpathLiteral(value: string): string {
  if (!value.includes('"')) {
    return `"${value}"`;
  }
  if (!value.includes("'")) {
    return `'${value}'`;
  }
  return `concat(${value
    .split('"')
    .map((part) => `"${part}"`)
    .join(", '\"', ")})`;
}

/**
 * Port of the spec's module-level `createBasicAlert({ includeNormal })`.
 *
 * Deviations, all forced and all in the safe direction:
 * - `cy.findByText("Done")` → `getByRole("button", …)`. Under Playwright the
 *   text form matches both the Mantine Button label span and its inner
 *   wrapper (full-textContent matching), a strict-mode violation; the button
 *   role resolves to the one actionable element. Same call the sibling port
 *   (tests/email-alert.spec.ts) makes for the identical upstream line.
 * - `cy.findByText("New alert").should("not.exist")` is an ABSENCE assertion
 *   with no positive anchor upstream — a zero-assertion is satisfied on its
 *   first poll, so retrying cannot save it and it would pass against a modal
 *   that had not yet rendered at all. Anchored here on the `POST
 *   /api/notification` response (proof the save actually happened) before the
 *   absence is read. Strengthening, stated explicitly.
 */
export async function createBasicAlert(
  page: Page,
  { includeNormal }: { includeNormal?: boolean } = {},
) {
  await page.getByLabel("Move, trash, and more…", { exact: true }).click();
  await popover(page).getByText("Create an alert", { exact: true }).click();

  if (includeNormal) {
    // `.findByText("Email").closest('[data-testid="channel-block"]')` — the
    // block is located by the text it contains, which `filter({ hasText })`
    // expresses directly. A literal `getByText("Email", { exact: true })` would
    // strict-mode-violate: ChannelSettingsBlock nests the label `<Text>` inside
    // a `<Group>` whose full textContent is also exactly "Email".
    await page
      .getByTestId("alert-configured-channel")
      .getByTestId("channel-block")
      .filter({ hasText: /^Email/ })
      .getByTestId("token-field")
      .click();
    await directTextContaining(page, NORMAL_FULL_NAME).click();
  }

  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/notification",
  );
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await saved;

  await expect(page.getByText("New alert", { exact: true })).toHaveCount(0);
}

/**
 * Harness for the upstream `before()` (NOT `beforeEach`) hook.
 *
 * Playwright's `page` / `mb` fixtures are test-scoped, so a `beforeAll` that
 * has to drive the UI needs its own context. `browser` and the custom
 * `workerBackend` fixture are worker-scoped and ARE available there, so this
 * builds the same three pieces `mb` does — a page, an API client, and cookie
 * based sign-in off the snapshot's cached sessions.
 *
 * Sign-in deliberately mirrors `MetabaseHarness.signIn`'s cached-session path
 * and never POSTs `/api/session`: that request would drop a `metabase.SESSION`
 * cookie into the API request jar, and `wrap-session-key` resolves cookie
 * before header, so every later API call would silently run as that user.
 * `LOGIN_CACHE` carries both `admin` and `normal`, so the fallback is never
 * reached — asserted rather than assumed.
 */
export async function createSetupHarness(browser: Browser, baseUrl: string) {
  const context = await browser.newContext({ baseURL: baseUrl });
  const page = await context.newPage();

  let sessionId: string | undefined;
  const api = new MetabaseApi(context.request, () => sessionId);

  const signIn = async (user: "admin" | "normal") => {
    const cached = LOGIN_CACHE[user];
    if (!cached) {
      throw new Error(
        `No cached session for "${user}" — signing in over /api/session would ` +
          "poison the API request cookie jar (see support/alert-permissions.ts).",
      );
    }
    sessionId = cached.sessionId;
    const { hostname } = new URL(baseUrl);
    const cookie = { domain: hostname, path: "/" };
    await context.addCookies([
      {
        name: "metabase.SESSION",
        value: cached.sessionId,
        httpOnly: true,
        ...cookie,
      },
      { name: "metabase.TIMEOUT", value: "alive", ...cookie },
      {
        name: "metabase.DEVICE",
        value: cached.deviceId,
        httpOnly: true,
        ...cookie,
      },
    ]);
  };

  return {
    page,
    api,
    signIn,
    dispose: () => context.close(),
  };
}
