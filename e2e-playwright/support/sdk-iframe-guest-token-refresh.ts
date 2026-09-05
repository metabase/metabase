import crypto from "crypto";

import type { FrameLocator, Locator, Page, Response } from "@playwright/test";

import { expect } from "./fixtures";
import { createCard, createTestQuery } from "./summarization";
import type { MetabaseApi } from "./api";
import {
  createNativeQuestion,
  createQuestion,
  createQuestionAndDashboard,
} from "./factories";
import { SAMPLE_DATABASE, SAMPLE_DB_ID } from "./sample-data";
import { JWT_SHARED_SECRET, SIMPLE_EMBED_IFRAME_SELECTOR } from "./sdk-iframe";

/**
 * Spec-local support for the port of
 *   e2e/test/scenarios/embedding/sdk-iframe-embedding/guest-token-refresh.cy.spec.ts
 *
 * `support/sdk-iframe.ts` (the shared embed.js harness) is consumed read-only,
 * per PORTING rule 9. The two things it does not yet cover are here:
 *
 *  1. `prepareGuestEmbedSdkIframeEmbedTest` — the guest-embed sibling of
 *     `prepareSdkIframeEmbedTest`. `findings-inbox/sdk-iframe-harness.md` §2
 *     flagged this as the ~20-line gap; this is it.
 *  2. `signGuestJwt` — a general-payload HS256 signer. The harness only exports
 *     `getSignedJwtForUser`, whose payload is an SSO user claim set; guest
 *     tokens carry `{ resource, params, exp }`.
 */

const { ORDERS_ID, PRODUCTS, PRODUCTS_ID } = SAMPLE_DATABASE;

/** Minimal structural type for the `mb` fixture — same approach as
 * `support/sdk-iframe.ts`, which cannot import the harness class either. */
type Harness = {
  baseUrl: string;
  api: MetabaseApi;
  restore(name?: string): Promise<void>;
  signInAsAdmin(): Promise<void>;
  signOut(): Promise<void>;
};

// === the mock guest-token provider =======================================

/** Port of the spec's PROVIDER_PATH. */
export const PROVIDER_PATH = "/api/mock-guest-token-provider";

/**
 * Port of `cy.intercept({ method: "POST", pathname: PROVIDER_PATH }, req =>
 * req.reply(reply)).as("guestTokenProvider")`.
 *
 * The provider URI is configured as a *relative* path, and `embed.js` resolves
 * it against `window.location.origin` (`embed.ts#_callGuestTokenProvider`), so
 * on the slot model it lands on `mb.baseUrl` — same origin as the customer
 * page, which is why no CORS handling is needed here (unlike the harness's
 * cross-origin `http://auth-provider/sso` mock).
 *
 * `embed.js` always appends `?response=json`, so the matcher is on pathname.
 */
export async function mockGuestTokenProvider(
  page: Page,
  mb: Harness,
  reply: { statusCode: number; body?: unknown },
) {
  const expectedOrigin = new URL(mb.baseUrl).origin;

  await page.route(
    (url) => url.origin === expectedOrigin && url.pathname === PROVIDER_PATH,
    async (route) => {
      if (route.request().method() !== "POST") {
        return route.fallback();
      }
      await route.fulfill({
        status: reply.statusCode,
        contentType: "application/json",
        // Cypress's `req.reply({ statusCode: 500 })` sends no body.
        body: reply.body === undefined ? "" : JSON.stringify(reply.body),
      });
    },
  );
}

/**
 * Port of `cy.wait("@guestTokenProvider")`.
 *
 * Every call site registers the intercept *before* the page load and waits
 * afterwards, and `cy.wait` consumes a past response — so on the filter tests
 * (where the initial token is short-lived and a refresh may already have
 * happened during load) upstream's wait can resolve retroactively. Arming this
 * before the load and awaiting it later reproduces exactly that: it settles on
 * the first provider response after registration, whenever that occurred.
 */
export function waitForGuestTokenProvider(
  page: Page,
  mb: Harness,
): Promise<Response> {
  const expectedOrigin = new URL(mb.baseUrl).origin;
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).origin === expectedOrigin &&
      new URL(response.url()).pathname === PROVIDER_PATH,
    { timeout: 60_000 },
  );
}

/**
 * Port of
 *   cy.get("iframe[data-metabase-embed]").its("0.contentWindow")
 *     .then(win => { win.FORCE_REFRESH_GUEST_EMBED_TOKEN_IN_CYPRESS = true })
 *
 * This is a real reach into the embed document (contrast the `frame.window()`
 * cases noted in findings-inbox/sdk-iframe-embedding.md §7, which actually
 * yield the top-level AUT window). The flag is read by
 * `embedding-sdk-bundle/store/guest-embed/auth.ts#getOrRefreshGuestSession`,
 * which runs inside the iframe, so it must be set on the iframe's own window.
 *
 * `FrameLocator` has no `evaluate`, so this goes through a real `Frame` handle.
 */
export async function forceGuestTokenRefresh(page: Page, index = 0) {
  const handle = await page
    .locator(SIMPLE_EMBED_IFRAME_SELECTOR)
    .nth(index)
    .elementHandle();
  const frame = await handle?.contentFrame();
  if (!frame) {
    throw new Error(`No content frame for embed iframe #${index}`);
  }
  await frame.evaluate(() => {
    (
      window as unknown as {
        FORCE_REFRESH_GUEST_EMBED_TOKEN_IN_CYPRESS?: boolean;
      }
    ).FORCE_REFRESH_GUEST_EMBED_TOKEN_IN_CYPRESS = true;
  });
}

// === JWT signing =========================================================

const base64url = (input: Buffer | string) =>
  Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

export type SignGuestJwtParams = (
  | { dashboardId: number; questionId?: never }
  | { questionId: number; dashboardId?: never }
) & { expirationSeconds: number; params?: Record<string, unknown> };

/**
 * Port of the spec-local `signJwt` (which calls the `signJwt` cy.task →
 * `jsonwebtoken.sign`).
 *
 * `jsonwebtoken` stamps `iat` automatically; this HMAC does not, so `iat` is
 * set explicitly — see PORTING ("Set `iat` explicitly when signing a JWT").
 * A *negative* `expirationSeconds` therefore yields the same shape upstream
 * produces for its expired tokens: `iat` now, `exp` in the past.
 *
 * HS256 via node `crypto` rather than `jose`/`jsonwebtoken`, matching the
 * harness's `getSignedJwtForUser`.
 */
export function signGuestJwt({
  dashboardId,
  questionId,
  expirationSeconds,
  params = {},
}: SignGuestJwtParams): string {
  const resource =
    dashboardId !== undefined
      ? { dashboard: dashboardId }
      : { question: questionId };

  const nowInSeconds = Math.round(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      resource,
      params,
      exp: nowInSeconds + expirationSeconds,
      iat: nowInSeconds,
    }),
  );
  const signature = base64url(
    crypto
      .createHmac("sha256", JWT_SHARED_SECRET)
      .update(`${header}.${payload}`)
      .digest(),
  );
  return `${header}.${payload}.${signature}`;
}

// === setup ===============================================================

/**
 * Port of H.prepareGuestEmbedSdkIframeEmbedTest
 * (e2e/support/helpers/e2e-embedding-iframe-sdk-helpers.ts:235).
 *
 * Differences from upstream, all forced:
 * - `mockEmbedJsToDevServer` is dropped, for the reason the harness records:
 *   jar mode is the verification default and the jar serves `app/embed.js`.
 * - The `cy.intercept(...).as("getCard"/"getCardQuery"/"getCardPivotQuery")`
 *   aliases are not registered — none of them is ever awaited by this spec,
 *   and PORTING rule 2 has specs arm their own `waitForResponse`.
 * - Upstream gates `activateToken` on `IS_ENTERPRISE`. The spike's backend is
 *   always the EE jar, so the token is activated unconditionally — the same
 *   call the shared `prepareSdkIframeEmbedTest` makes unconditionally.
 */
export async function prepareGuestEmbedSdkIframeEmbedTest(
  mb: Harness,
  {
    withTokenFeatures = true,
    onPrepare,
  }: {
    withTokenFeatures?: boolean;
    onPrepare?: () => Promise<void>;
  } = {},
) {
  await mb.restore();
  await mb.signInAsAdmin();

  await mb.api.activateToken(withTokenFeatures ? "bleeding-edge" : "starter");

  await onPrepare?.();

  await mb.api.updateSetting("enable-embedding-simple", true);
  await mb.api.updateSetting("enable-embedding-static", true);
  await mb.api.updateSetting("embedding-secret-key", JWT_SHARED_SECRET);

  await mb.signOut();
}

// === the spec's fixture builders =========================================

export const PRICE_DASHBOARD_PARAMETER = {
  name: "Price greater than",
  slug: "price",
  id: "aaaaaaaa",
  type: "number/>=",
  sectionId: "number",
};

export const CATEGORY_DASHBOARD_PARAMETER = {
  name: "Category",
  slug: "category",
  id: "bbbbbbbb",
  type: "string/=",
  sectionId: "string",
};

/** Port of the spec-local createDashboardWithQuestion. */
export async function createDashboardWithQuestion(
  api: MetabaseApi,
): Promise<number> {
  const { dashboardId } = await createQuestionAndDashboard(api, {
    questionDetails: {
      name: "Orders",
      query: { "source-table": ORDERS_ID },
    },
    dashboardDetails: {
      name: "Guest Token Refresh Dashboard",
      enable_embedding: true,
      embedding_type: "guest-embed",
    },
    cardDetails: { row: 0, col: 0, size_x: 11, size_y: 6 },
  });
  return dashboardId;
}

async function createDashboardWithSingleFilter(
  api: MetabaseApi,
  {
    columnName,
    cardName,
    fieldId,
    dashboardName,
    parameter,
    embeddingParams,
  }: {
    columnName: string;
    cardName: string;
    fieldId: number;
    dashboardName: string;
    parameter: typeof PRICE_DASHBOARD_PARAMETER;
    embeddingParams: Record<string, string>;
  },
): Promise<number> {
  const datasetQuery = await createTestQuery(api, {
    database: SAMPLE_DB_ID,
    stages: [
      {
        source: { type: "table", id: PRODUCTS_ID },
        fields: [
          { type: "column", name: "ID", sourceName: "PRODUCTS" },
          { type: "column", name: "TITLE", sourceName: "PRODUCTS" },
          { type: "column", name: columnName, sourceName: "PRODUCTS" },
        ],
        limit: 10,
      },
    ],
  });

  const question = await createCard(api, {
    dataset_query: datasetQuery,
    name: cardName,
  });

  const dashboardResponse = await api.post("/api/dashboard", {
    name: dashboardName,
    parameters: [parameter],
  });
  const dashboard = (await dashboardResponse.json()) as { id: number };

  await api.put(`/api/dashboard/${dashboard.id}`, {
    enable_embedding: true,
    embedding_type: "guest-embed",
    embedding_params: embeddingParams,
    dashcards: [
      {
        id: -1,
        card_id: question.id,
        row: 0,
        col: 0,
        size_x: 24,
        size_y: 6,
        parameter_mappings: [
          {
            parameter_id: parameter.id,
            card_id: question.id,
            target: ["dimension", ["field", fieldId, null]],
          },
        ],
      },
    ],
  });

  return dashboard.id;
}

/** Port of the spec-local createDashboardWithPriceFilter. */
export function createDashboardWithPriceFilter(
  api: MetabaseApi,
): Promise<number> {
  return createDashboardWithSingleFilter(api, {
    columnName: "PRICE",
    cardName: "Products with price filter",
    fieldId: PRODUCTS.PRICE,
    dashboardName: "Guest Token Refresh Dashboard with Price Filter",
    parameter: PRICE_DASHBOARD_PARAMETER,
    embeddingParams: { price: "enabled" },
  });
}

/** Port of the spec-local createDashboardWithCategoryFilter. */
export function createDashboardWithCategoryFilter(
  api: MetabaseApi,
): Promise<number> {
  return createDashboardWithSingleFilter(api, {
    columnName: "CATEGORY",
    cardName: "Products with category filter",
    fieldId: PRODUCTS.CATEGORY,
    dashboardName: "Guest Token Refresh Dashboard with Category Filter",
    parameter: CATEGORY_DASHBOARD_PARAMETER,
    embeddingParams: { category: "enabled" },
  });
}

/**
 * Port of the spec-local createStandaloneQuestion.
 *
 * `embedding_type: "guest-embed"` is deliberately NOT passed on. Upstream's
 * `question()` helper (api/createQuestion.ts) does not destructure it and does
 * not send it in either the POST or the follow-up PUT, so the card upstream
 * creates carries only `enable_embedding: true`. The shared
 * `factories.createQuestion` spreads unknown keys into the POST, which would
 * have made the port *differ* from the original rather than match it.
 */
export async function createStandaloneQuestion(
  api: MetabaseApi,
): Promise<number> {
  const question = await createQuestion(api, {
    name: "Orders",
    enable_embedding: true,
    query: { "source-table": ORDERS_ID },
  });
  return question.id;
}

/** Port of the spec-local createQuestionWithPriceFilter. Same
 * `embedding_type` note as createStandaloneQuestion. */
export async function createQuestionWithPriceFilter(
  api: MetabaseApi,
): Promise<number> {
  const question = await createNativeQuestion(api, {
    name: "Products with price filter",
    native: {
      query: "SELECT ID, TITLE, PRICE FROM PRODUCTS WHERE {{price}} LIMIT 10",
      "template-tags": {
        price: {
          id: "cccccccc",
          name: "price",
          "display-name": "Price greater than",
          type: "dimension",
          dimension: ["field", PRODUCTS.PRICE, null],
          "widget-type": "number/>=",
          required: false,
        },
      },
    },
    enable_embedding: true,
    embedding_params: { price: "enabled" },
  });
  return question.id;
}

/** Port of the spec-local createQuestionWithCategoryFilter. Same
 * `embedding_type` note as createStandaloneQuestion. */
export async function createQuestionWithCategoryFilter(
  api: MetabaseApi,
): Promise<number> {
  const question = await createNativeQuestion(api, {
    name: "Products with category filter",
    native: {
      query:
        "SELECT ID, TITLE, CATEGORY FROM PRODUCTS WHERE {{category}} LIMIT 10",
      "template-tags": {
        category: {
          id: "dddddddd",
          name: "category",
          "display-name": "Category",
          type: "dimension",
          dimension: ["field", PRODUCTS.CATEGORY, null],
          "widget-type": "category",
          required: false,
        },
      },
    },
    enable_embedding: true,
    embedding_params: { category: "enabled" },
  });
  return question.id;
}

// === assertions ==========================================================

/**
 * Port of H.assertTableData scoped to the embed frame. Upstream calls it inside
 * `getSimpleEmbedIframeContent().within(...)`, where its `cy.findByTestId`
 * lookups resolve against the iframe body.
 *
 * (`data-model.ts` has the same helper typed `Locator`-only; unifying the two
 * on a `Page | FrameLocator | Locator` scope is a consolidation candidate.)
 */
export async function assertTableData(
  scope: FrameLocator | Locator,
  { columns, firstRows = [] }: { columns: string[]; firstRows?: string[][] },
) {
  const headerCells = scope
    .getByTestId("table-root")
    .getByTestId("header-cell");
  await expect(headerCells).toHaveCount(columns.length, { timeout: 40_000 });
  for (const [index, column] of columns.entries()) {
    await expect(headerCells.nth(index)).toHaveText(column);
  }

  const bodyCells = scope.getByTestId("table-body").getByTestId("cell-data");
  for (const [rowIndex, row] of firstRows.entries()) {
    for (const [cellIndex, cell] of row.entries()) {
      await expect(
        bodyCells.nth(columns.length * rowIndex + cellIndex),
      ).toHaveText(cell);
    }
  }
}
