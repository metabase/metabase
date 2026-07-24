/**
 * Playwright port of e2e/test/scenarios/admin/oauth-authorizations.cy.spec.ts
 *
 * End-to-end coverage for the OAuth Authorizations admin page. Events are
 * seeded through the *real* OAuth endpoints rather than stubbed, so this
 * exercises the full contract: the DCR registration write-path, the
 * consent/decision write-path, and the admin read endpoint the page consumes.
 * `approved`/`denied` rendering paths are also covered by the backend
 * integration tests in `oauth_server/api_test.clj` and
 * `oauth_server/api/admin_test.clj`.
 *
 * Note: `POST /oauth/register` is throttled to 10/min/IP (mb.restore() resets
 * throttlers), so we deliberately seed only a handful of events here.
 * Pagination is covered by the page's unit test instead.
 */
import type { Locator, Page, Response } from "@playwright/test";

import { test, expect } from "../support/fixtures";
import { USERS } from "../support/sample-data";
import {
  OAUTH_REDIRECT_URI,
  approveOauthClient,
  caseSensitiveSubstring,
  denyOauthClient,
  registerOauthClient,
} from "../support/wave7-filters-admin";

const PATH = "/admin/metabot/mcp/authorizations";

test.describe("scenarios > admin > metabot > oauth authorizations", () => {
  test.beforeEach(async ({ mb }) => {
    await mb.restore("default");
    await mb.signInAsAdmin();
  });

  test("lists registration, approval, and denial events with client and user details", async ({
    page,
  }) => {
    // Seeding goes through page.request so the consent flow runs as the
    // signed-in admin (session cookie) and carries the CSRF cookie.
    await registerOauthClient(page.request, "E2E MCP Client A");
    const clientB = await registerOauthClient(page.request, "E2E MCP Client B", {
      token_endpoint_auth_method: "client_secret_basic",
    });
    await approveOauthClient(page.request, clientB);
    const clientC = await registerOauthClient(page.request, "E2E MCP Client C", {
      token_endpoint_auth_method: "client_secret_basic",
    });
    await denyOauthClient(page.request, clientC);

    await page.goto(PATH);

    // Every client's registration row renders, and each decision event lands
    // in the same row as its client (and the deciding user). Client A's row
    // also shows the registered redirect URI.
    await assertEventRow(page, "E2E MCP Client A", "Registered", OAUTH_REDIRECT_URI);
    await assertEventRow(page, "E2E MCP Client B", "Registered");
    await assertEventRow(page, "E2E MCP Client C", "Registered");
    await assertEventRow(page, "E2E MCP Client B", "Approved", USERS.admin.email);
    await assertEventRow(page, "E2E MCP Client C", "Denied", USERS.admin.email);
  });

  test("filters events by type via the API", async ({ page }) => {
    const client = await registerOauthClient(page.request, "E2E Filter Client", {
      token_endpoint_auth_method: "client_secret_basic",
    });
    await approveOauthClient(page.request, client);

    const initialList = waitForAuthorizationsList(page);
    await page.goto(PATH);
    await initialList;

    await page.getByLabel("Filter by event", { exact: true }).click();
    // Selecting the option is what fires the filtered list request.
    const filteredList = waitForAuthorizationsList(page);
    await page.getByRole("option", { name: "Approved", exact: true }).click();
    expect((await filteredList).url()).toContain("event-type=approved");

    const table = page.getByTestId("oauth-authorizations-table");
    await expect(table.getByText("Approved", { exact: true })).toBeVisible();
    await expect(table.getByText("Registered", { exact: true })).toHaveCount(0);
  });

  test("is accessible to superusers only", async ({ mb }) => {
    await mb.signInAsNormalUser();
    const response = await mb.api.get("/api/oauth/authorizations", {
      failOnStatusCode: false,
    });
    expect(response.status()).toBe(403);
  });
});

function waitForAuthorizationsList(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      new URL(response.url()).pathname === "/api/oauth/authorizations",
  );
}

/**
 * Assert exactly one table row contains all of the given texts together —
 * ties a specific event (and the deciding user) to the expected client's row
 * rather than checking page-wide counts.
 */
async function assertEventRow(page: Page, ...texts: string[]) {
  let rows: Locator = page
    .getByTestId("oauth-authorizations-table")
    .getByRole("row");
  for (const text of texts) {
    rows = rows.filter({ hasText: caseSensitiveSubstring(text) });
  }
  await expect(rows, `row matching ${texts.join(" / ")}`).toHaveCount(1);
}
