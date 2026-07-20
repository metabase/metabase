/**
 * Per-spec helpers for tests/sandboxing-via-api.spec.ts (port of
 * e2e/test/scenarios/permissions/sandboxing/sandboxing-via-api.cy.spec.js).
 *
 * New file so the shared support modules stay untouched (porting rule 9).
 * Everything the spec can reuse read-only is imported from the existing
 * modules — notably `sandboxTable` / `updatePermissionsGraph`
 * (dashboard-repros.ts), `blockUserGroupPermissions`
 * (table-collection-permissions.ts) and `assertDatasetReqIsSandboxed`
 * (notebook-link-to-data-source.ts).
 *
 * Ported here:
 * - USER_GROUPS / SANDBOXED user attributes (cypress_data.js constants the
 *   shared sample-data.ts does not carry).
 * - H.savePermissions (e2e-permissions-helpers.js) — distinct from the
 *   already-ported H.saveChangesToPermissions.
 * - cy.createUserFromRawData + the `cy.request("POST", "/api/session")`
 *   sign-in for a user with no cached session.
 * - the spec-local createJoinedQuestion / preparePermissions.
 * - response-capturing variants of the visit helpers: Cypress's
 *   `assertDatasetReqIsSandboxed` reads a cy.intercept alias, which in
 *   Playwright means registering the waitForResponse BEFORE the navigation
 *   (porting rule 2) and holding the Response object.
 */
import { expect } from "@playwright/test";
import type { BrowserContext, Locator, Page, Response } from "@playwright/test";

import { MetabaseApi } from "./api";
import { BASE_URL } from "./env";
import { createQuestion } from "./factories";
import type { Card } from "./factories";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "./sample-data";
import { blockUserGroupPermissions } from "./table-collection-permissions";
import { main } from "./ui";

const { ORDERS, ORDERS_ID, PRODUCTS_ID } = SAMPLE_DATABASE;

// === constants mirrored from e2e/support/cypress_data.js ===

/** USER_GROUPS (e2e/support/cypress_data.js) — fixed ids baked into the
 * default snapshot. */
export const ALL_USERS_GROUP = 1;
export const COLLECTION_GROUP = 5;
export const DATA_GROUP = 6;
export const READONLY_GROUP = 7;

/** USERS.sandboxed.login_attributes (e2e/support/cypress_data.js). */
export const SANDBOXED_USER = {
  email: "u1@metabase.test",
  password: "12341234",
  login_attributes: { attr_uid: "1", attr_cat: "Widget" },
} as const;

/** `Number(USERS.sandboxed.login_attributes.attr_uid)` — the value every
 * `assertDatasetReqIsSandboxed({ columnId: ORDERS.USER_ID, ... })` in the
 * spec compares against. */
export const SANDBOXED_ATTR_UID = Number(
  SANDBOXED_USER.login_attributes.attr_uid,
);

/** The spec's VIEW_DATA_PERMISSION_INDEX. */
export const VIEW_DATA_PERMISSION_INDEX = 0;

// === ports of e2e/support/cypress_sample_instance_data.js ===

import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";

/** Port of NORMAL_USER_ID (cypress_sample_instance_data.js). */
export const NORMAL_USER_ID: number = (() => {
  const user = SAMPLE_INSTANCE_DATA.users.find(
    (candidate) => candidate.email === "normal@metabase.test",
  );
  if (!user) {
    throw new Error('User "normal@metabase.test" not found in instance data');
  }
  return Number(user.id);
})();

/** Port of ORDERS_DASHBOARD_DASHCARD_ID (cypress_sample_instance_data.js):
 * the first dashcard of "Orders in a dashboard". */
export const ORDERS_DASHBOARD_DASHCARD_ID: number = (() => {
  const dashboard = (
    SAMPLE_INSTANCE_DATA.dashboards as {
      name: string;
      dashcards: { id: number }[];
    }[]
  ).find((candidate) => candidate.name === "Orders in a dashboard");
  if (!dashboard) {
    throw new Error('Dashboard "Orders in a dashboard" not found');
  }
  return Number(dashboard.dashcards[0].id);
})();

// === spec-local setup ===

/** Port of the spec-local preparePermissions(). */
export async function preparePermissions(api: MetabaseApi) {
  await blockUserGroupPermissions(api, ALL_USERS_GROUP);
  await blockUserGroupPermissions(api, COLLECTION_GROUP);
  await blockUserGroupPermissions(api, READONLY_GROUP);
}

/**
 * Port of the spec-local createJoinedQuestion(name, { visitQuestion }).
 *
 * Upstream's `question()` helper registers `cy.intercept("POST",
 * "/api/card/**\/:id/query").as("cardQuery")` before visiting, which is the
 * alias test #14841 later reads — so when `visitQuestion` is set this returns
 * the captured card-query Response alongside the card.
 */
export async function createJoinedQuestion(
  api: MetabaseApi,
  name: string,
  {
    page,
    visitQuestion = false,
  }: { page?: Page; visitQuestion?: boolean } = {},
): Promise<{ card: Card; cardQuery?: Response }> {
  const card = await createQuestion(api, {
    name,
    query: {
      "source-table": ORDERS_ID,
      joins: [
        {
          fields: "all",
          "source-table": PRODUCTS_ID,
          condition: [
            "=",
            ["field", ORDERS.PRODUCT_ID, null],
            ["field", SAMPLE_DATABASE.PRODUCTS.ID, { "join-alias": "Products" }],
          ],
          alias: "Products",
        },
      ],
    },
  });

  if (!visitQuestion) {
    return { card };
  }
  if (!page) {
    throw new Error("createJoinedQuestion: visitQuestion needs a page");
  }
  const cardQuery = await visitQuestionCapturingCardQuery(page, card.id);
  return { card, cardQuery };
}

// === response-capturing visit helpers ===

/** POST /api/card/**\/:id/query — the `cardQuery` / `cardQuery<id>` aliases.
 * The wildcard covers the pivot endpoint (/api/card/pivot/:id/query). */
export function isCardQueryResponse(response: Response, id: number): boolean {
  return (
    response.request().method() === "POST" &&
    new RegExp(`^/api/card/(.+/)?${id}/query$`).test(
      new URL(response.url()).pathname,
    )
  );
}

/**
 * H.visitQuestion(id) with the card-query response handed back. Mirrors the
 * shared ui.ts visitQuestion (metadata + query waits registered before the
 * navigation), but keeps the Response so the sandboxing assertions can read
 * its body — the Playwright equivalent of `cy.get("@cardQuery<id>")`.
 */
export async function visitQuestionCapturingCardQuery(
  page: Page,
  id: number,
): Promise<Response> {
  const metadata = page.waitForResponse((response) =>
    new RegExp(`^/api/card/(.+/)?${id}/query_metadata$`).test(
      new URL(response.url()).pathname,
    ),
  );
  const query = page.waitForResponse((response) =>
    isCardQueryResponse(response, id),
  );
  await page.goto(`/question/${id}`);
  await metadata;
  return query;
}

/** POST /api/dataset — the `dataset` / `datasetQuery` aliases. */
export function isDatasetResponse(response: Response): boolean {
  return (
    response.request().method() === "POST" &&
    new URL(response.url()).pathname === "/api/dataset"
  );
}

/** POST /api/dashboard/:dash/dashcard/:dashcard/card/:card/query — the
 * `dashcardQuery<dashcardId>` alias H.visitDashboard registers. */
export function isDashcardQueryResponse(
  response: Response,
  dashcardId: number,
): boolean {
  return (
    response.request().method() === "POST" &&
    new RegExp(`/dashcard/${dashcardId}/card/\\d+/query$`).test(
      new URL(response.url()).pathname,
    )
  );
}

/**
 * Port of H.openTable / H.openOrdersTable etc. with the `callback` option:
 * upstream's callback receives the `@dataset` xhr, so the port returns the
 * Response. Same hash + waits as the shared ad-hoc-question.ts openTable
 * (simple mode only — no spec call site opens a table in notebook mode with a
 * callback).
 */
export async function openTableCapturingDataset(
  page: Page,
  { table, database = SAMPLE_DB_ID }: { table: number; database?: number },
): Promise<Response> {
  const question = {
    dataset_query: {
      database,
      query: { "source-table": table },
      type: "query" as const,
    },
  };
  const hash = Buffer.from(
    JSON.stringify({
      display: "table",
      displayIsLocked: false,
      ...question,
    }),
  ).toString("base64");

  const metadata = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/dataset/query_metadata",
  );
  const dataset = page.waitForResponse(isDatasetResponse);
  await page.goto(`/question#${hash}`);
  await metadata;
  return dataset;
}

// === UI helpers with no shared port ===

/**
 * Port of H.savePermissions (e2e-permissions-helpers.js). Distinct from
 * H.saveChangesToPermissions (command-palette.ts): no response wait, and it
 * asserts the edit bar goes away.
 */
export async function savePermissions(page: Page) {
  await page
    .getByTestId("edit-bar")
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByText("Yes", { exact: true })
    .click();
  await expect(page.getByTestId("edit-bar")).toHaveCount(0);
}

/** Port of H.dashboardCards (e2e-ui-elements-helpers.js). */
export function dashboardCards(page: Page): Locator {
  return page.locator("[data-element-id=dashboard-cards-container]");
}

/** Port of H.tableInteractive (cy.findByTestId("table-root")). */
export function tableInteractive(page: Page): Locator {
  return page.getByTestId("table-root");
}

/** `cy.get(".test-TableInteractive-cellWrapper--firstColumn")` — the spec's
 * row-count proxy. */
export function firstColumnCells(page: Page): Locator {
  return page.locator(".test-TableInteractive-cellWrapper--firstColumn");
}

export { main };

// === users ===

/** Port of cy.createUserFromRawData: POST /api/user, then dismiss the
 * "it's ok to play around" modal for the created user. */
export async function createUserFromRawData(
  api: MetabaseApi,
  user: Record<string, unknown>,
): Promise<{ id: number }> {
  const response = await api.post("/api/user", user);
  const created = (await response.json()) as { id: number };
  await api.put(`/api/user/${created.id}/modal/qbnewb`, {});
  return created;
}

/**
 * Port of `cy.request("POST", "/api/session", { username, password })` for a
 * user created during the test (no cached snapshot session). Sets the browser
 * cookies the same way the mb fixture does, and returns an API client bound to
 * the new session — the mb fixture's own api keeps the previous user's
 * session, so anything doing API work as this user must use the returned
 * client.
 */
export async function signInWithCredentials(
  context: BrowserContext,
  api: MetabaseApi,
  { username, password }: { username: string; password: string },
): Promise<MetabaseApi> {
  const response = await api.post("/api/session", { username, password });
  const { id } = (await response.json()) as { id: string };

  const { hostname } = new URL(BASE_URL);
  const cookie = { domain: hostname, path: "/" };
  await context.addCookies([
    { name: "metabase.SESSION", value: id, httpOnly: true, ...cookie },
    { name: "metabase.TIMEOUT", value: "alive", ...cookie },
    { name: "metabase.DEVICE", value: "my-device-id", httpOnly: true, ...cookie },
  ]);

  return new MetabaseApi(api.requestContext, () => id);
}
