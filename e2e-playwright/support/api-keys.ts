/**
 * Helpers for the API-keys admin-settings spec
 * (e2e/test/scenarios/admin-2/api-keys.cy.spec.ts).
 *
 * Ports of:
 * - H.createApiKey (e2e/support/helpers/api/createApiKey.ts)
 * - H.tryToCreateApiKeyViaModal (e2e/support/helpers/e2e-api-key-helpers.ts)
 * - the spec-local visitApiKeySettings + the X-Api-Key request helpers
 *   (createQuestionForApiKey / createDashboardForApiKey /
 *   editQuestionForApiKey / editDashboardForApiKey).
 *
 * SECURITY: the generated key value is returned to callers that need it (to
 * drive X-Api-Key requests, exactly as the Cypress original does) but is never
 * logged or echoed here.
 */
import { expect } from "@playwright/test";
import type { APIResponse, Locator, Page, Response } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "./sample-data";
import { modal } from "./ui";

/** The subset of the test harness these helpers touch (mirrors the local type
 * in dashboard-filters-2.ts — MetabaseHarness isn't exported from fixtures). */
type MetabaseHarness = { api: MetabaseApi };

const { PRODUCTS_ID } = SAMPLE_DATABASE;

/**
 * Fixed group ids from the `default` snapshot — mirrors USER_GROUPS
 * (e2e/support/cypress_data.js) and the magic-group derivations in
 * cypress_sample_instance_data.js.
 */
export const ADMINISTRATORS_GROUP_ID = 2;
export const ALL_USERS_GROUP_ID = 1;
export const READONLY_GROUP_ID = 7;
export const NOSQL_GROUP_ID = 8;

/** POST /api/api-key predicate. */
const isCreateKey = (response: Response) =>
  response.request().method() === "POST" &&
  new URL(response.url()).pathname === "/api/api-key";

/** GET /api/api-key (the list, NOT /count). */
const isGetKeys = (response: Response) =>
  response.request().method() === "GET" &&
  new URL(response.url()).pathname === "/api/api-key";

/** GET /api/api-key/count. */
const isGetKeyCount = (response: Response) =>
  response.request().method() === "GET" &&
  new URL(response.url()).pathname === "/api/api-key/count";

/** PUT /api/api-key/:id (the edit — excludes /regenerate). */
const isUpdateKey = (response: Response) =>
  response.request().method() === "PUT" &&
  /^\/api\/api-key\/[^/]+$/.test(new URL(response.url()).pathname);

/** PUT /api/api-key/:id/regenerate. */
const isRegenerateKey = (response: Response) =>
  response.request().method() === "PUT" &&
  /^\/api\/api-key\/[^/]+\/regenerate$/.test(new URL(response.url()).pathname);

/** DELETE /api/api-key/:id. */
const isDeleteKey = (response: Response) =>
  response.request().method() === "DELETE" &&
  /^\/api\/api-key\/[^/]+$/.test(new URL(response.url()).pathname);

export const waitForCreateKey = (page: Page) => page.waitForResponse(isCreateKey);
export const waitForGetKeys = (page: Page) => page.waitForResponse(isGetKeys);
export const waitForGetKeyCount = (page: Page) =>
  page.waitForResponse(isGetKeyCount);
export const waitForUpdateKey = (page: Page) => page.waitForResponse(isUpdateKey);
export const waitForRegenerateKey = (page: Page) =>
  page.waitForResponse(isRegenerateKey);
export const waitForDeleteKey = (page: Page) => page.waitForResponse(isDeleteKey);

/** Port of H.createApiKey: POST /api/api-key as the current (admin) user.
 * Returns the parsed response body (which includes `unmasked_key`). */
export async function createApiKey(
  mb: MetabaseHarness,
  name: string,
  groupId: number,
): Promise<{ id: number; unmasked_key: string }> {
  const response = await mb.api.post("/api/api-key", {
    name,
    group_id: groupId,
  });
  return response.json();
}

/**
 * Port of the spec-local visitApiKeySettings: navigate to the API-keys admin
 * page, wait for the list GET, and assert the settings header rendered.
 */
export async function visitApiKeySettings(page: Page) {
  const getKeys = waitForGetKeys(page);
  await page.goto("/admin/settings/authentication/api-keys");
  await getKeys;
  await expect(page.getByTestId("api-keys-settings-header")).toBeVisible();
}

/**
 * Port of H.tryToCreateApiKeyViaModal. Fills the create modal, picks the group
 * option, clicks Create, and resolves with the POST /api/api-key response so
 * callers can assert on its status. Note the Cypress "hidden: true" workaround
 * for the Mantine bug that marks the dropdown aria-hidden while the modal is
 * open — ported as `includeHidden: true`.
 */
export async function tryToCreateApiKeyViaModal(
  page: Page,
  { name, group }: { name: string; group: string },
): Promise<Response> {
  await page
    .getByTestId("api-keys-settings-header")
    .getByRole("button", { name: /create an api key/i })
    .click();

  const dialog = modal(page);
  await dialog.getByLabel(/Key name/).fill(name);
  await dialog.getByLabel(/group/i).click();

  await page
    .getByRole("listbox", { includeHidden: true })
    .getByRole("option", { name: group, exact: true, includeHidden: true })
    .click();

  const createKey = waitForCreateKey(page);
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  return createKey;
}

/** The row in the API-keys table that contains the given key name. */
export function apiKeyRow(page: Page, name: string): Locator {
  return page
    .getByTestId("api-keys-table")
    .getByRole("row")
    .filter({ has: page.getByText(name, { exact: true }) });
}

// === X-Api-Key request helpers ===
// These run through the isolated APIRequestContext with only the X-Api-Key
// header set (no session), so the request is authenticated purely by the key —
// mirroring the Cypress helpers' cy.signOut() + X-Api-Key request.

async function apiKeyFetch(
  mb: MetabaseHarness,
  method: "GET" | "POST" | "PUT",
  url: string,
  apiKey: string,
  data?: unknown,
): Promise<APIResponse> {
  return mb.api.requestContext.fetch(url, {
    method,
    data,
    headers: { "X-Api-Key": apiKey },
  });
}

/** Port of createQuestionForApiKey. */
export async function createQuestionForApiKey(
  mb: MetabaseHarness,
  apiKey: string,
): Promise<{ id: number }> {
  const response = await apiKeyFetch(mb, "POST", "/api/card", apiKey, {
    name: "Test Question",
    display: "table",
    visualization_settings: {},
    dataset_query: {
      database: SAMPLE_DB_ID,
      type: "query",
      query: {
        "source-table": PRODUCTS_ID,
        limit: 22,
      },
    },
  });
  return response.json();
}

/** Port of createDashboardForApiKey. */
export async function createDashboardForApiKey(
  mb: MetabaseHarness,
  apiKey: string,
): Promise<{ id: number }> {
  const response = await apiKeyFetch(mb, "POST", "/api/dashboard", apiKey, {
    name: "Test Dashboard",
  });
  return response.json();
}

/** Port of editQuestionForApiKey: GET the card, then PUT it back renamed. */
export async function editQuestionForApiKey(
  mb: MetabaseHarness,
  apiKey: string,
  questionId: number,
  newQuestionName: string,
): Promise<void> {
  const previous = await (
    await apiKeyFetch(mb, "GET", `/api/card/${questionId}`, apiKey)
  ).json();
  await apiKeyFetch(mb, "PUT", `/api/card/${questionId}`, apiKey, {
    ...previous,
    name: newQuestionName,
  });
}

/** Port of editDashboardForApiKey: GET the dashboard, then PUT it back renamed. */
export async function editDashboardForApiKey(
  mb: MetabaseHarness,
  apiKey: string,
  dashboardId: number,
  newDashboardName: string,
): Promise<void> {
  const previous = await (
    await apiKeyFetch(mb, "GET", `/api/dashboard/${dashboardId}`, apiKey)
  ).json();
  await apiKeyFetch(mb, "PUT", `/api/dashboard/${dashboardId}`, apiKey, {
    ...previous,
    name: newDashboardName,
  });
}
