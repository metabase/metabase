import crypto from "crypto";

import type { Page } from "@playwright/test";

import type { MetabaseApi } from "./api";
import { addOrUpdateDashboardCard } from "./drillthroughs";
import { createDashboard, createNativeQuestion, createQuestion } from "./factories";
import { SAMPLE_DATABASE } from "./sample-data";
import { JWT_SHARED_SECRET } from "./sdk-iframe";

/**
 * Spec-local helper surface for the port of
 *   e2e/test/scenarios/embedding/sdk-iframe-embedding/eajs-internal-navigation.cy.spec.ts
 *
 * PORTING rule 9: new module per agent. `support/sdk-iframe.ts` (the shared
 * Group A harness) and `support/sdk-iframe-embedding.ts` (which already owns
 * the `@getDashCardQuery` / `@getCardQuery` waits) are consumed READ-ONLY.
 */

const { ORDERS, ORDERS_ID } = SAMPLE_DATABASE;

/**
 * Port of the spec's `TARGET_DASHBOARD_FILTER`, which upstream builds with
 * `createMockActionParameter` from `metabase-types/api/mocks`. That module is
 * not importable from this package, and the mock is a pure object literal
 * anyway, so it is inlined here — expanded exactly as the two mock factories
 * compose it:
 *
 *   createMockActionParameter({ id, name, slug, type, sectionId })
 *     → createMockParameter({ id, name: "ID", type: "type/Integer",
 *                             slug: "id", ...opts })
 *       (createMockParameter's own defaults are all overridden here)
 *     → plus `target = ["variable", ["template-tag", id]]`
 */
export const TARGET_DASHBOARD_FILTER = {
  id: "target-dashboard-filter",
  name: "ID Filter",
  slug: "id-filter",
  type: "number/=",
  sectionId: "number",
  target: ["variable", ["template-tag", "target-dashboard-filter"]],
};

// === JWT for a guest-embed resource ======================================

const base64url = (input: Buffer | string) =>
  Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

/**
 * Port of H.getSignedJwtForResource (e2e-embedding-helpers.js). Upstream signs
 * with `jose`; that package lives in the repo-root node_modules, not this
 * package's, so HS256 is done with node's own crypto — the same two-line HMAC
 * `support/sdk-iframe.ts getSignedJwtForUser` uses.
 *
 * `iat` is set explicitly and deliberately: the backend unsigns embedding
 * tokens with a max-age, so a token without `iat` is rejected (PORTING,
 * batch-12). Upstream's payload is `{ resource: { [type]: id }, params, iat,
 * exp }` and this matches it claim for claim.
 */
export function getSignedJwtForResource({
  resourceId,
  resourceType,
  params = {},
  expirationMinutes = 10,
}: {
  resourceId: number;
  resourceType: "question" | "dashboard";
  params?: Record<string, unknown>;
  expirationMinutes?: number;
}): string {
  const iat = Math.round(Date.now() / 1000);
  const exp = iat + 60 * expirationMinutes;

  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({ resource: { [resourceType]: resourceId }, params, iat, exp }),
  );
  const signature = base64url(
    crypto
      .createHmac("sha256", JWT_SHARED_SECRET)
      .update(`${header}.${payload}`)
      .digest(),
  );
  return `${header}.${payload}.${signature}`;
}

// === waits ===============================================================

/**
 * Port of the `@getDashboard` alias registered by
 * `H.prepareSdkIframeEmbedTest`: `cy.intercept("GET", "/api/dashboard/*")`.
 *
 * The glob is a single path segment, so `/api/dashboard/:id/query_metadata`
 * and the dashcard-query POST are both excluded.
 *
 * NOTE this is strictly stronger than upstream's `cy.wait("@getDashboard")` in
 * both places it is used: the embed's *initial* dashboard load has already
 * fired one of these by then, and `cy.wait` consumes past responses while
 * `waitForResponse` does not (FINDINGS #16). Registered immediately before the
 * click, this really does wait for the navigation's own fetch.
 */
export function waitForDashboardGet(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      /^\/api\/dashboard\/[^/]+$/.test(new URL(response.url()).pathname),
    { timeout: 60_000 },
  );
}

// === fixtures ============================================================

export type ClickBehaviorFixture = {
  nativeQuestionId: number;
  targetDashboardId: number;
  startingDashboardId: number;
};

/**
 * Port of the `click behavior navigation` describe's `beforeEach` body (minus
 * `prepareSdkIframeEmbedTest`).
 *
 * Setup: a "Starting Dashboard" whose card carries two column click behaviors —
 * ID links to "Target Dashboard" (passing a filter parameter), PRODUCT_ID links
 * to a native question (passing a template-tag variable).
 *
 * Upstream sequences this with `cy.wrap(...).as(...)` + a trailing `cy.then`
 * purely to get the target ids before building the click behaviors; awaiting is
 * the direct equivalent.
 */
export async function setupClickBehaviorNavigation(
  api: MetabaseApi,
): Promise<ClickBehaviorFixture> {
  // 1. a native question with a parameter (the question link target)
  const nativeQuestion = await createNativeQuestion(api, {
    name: "Native Question with Param",
    native: {
      query: "SELECT * FROM ORDERS WHERE ID = {{id}} LIMIT 10",
      "template-tags": {
        id: {
          id: "native-id-tag",
          name: "id",
          "display-name": "ID",
          type: "number",
          required: false,
        },
      },
    },
  });

  // 2. the target dashboard, with a filter parameter mapped to ORDERS.ID
  const targetDashboard = await createDashboard(api, {
    name: "Target Dashboard",
    parameters: [TARGET_DASHBOARD_FILTER],
  });

  const targetQuestion = await createQuestion(api, {
    name: "Orders for Target Dashboard",
    query: { "source-table": ORDERS_ID, limit: 5 },
  });

  await addOrUpdateDashboardCard(api, {
    card_id: targetQuestion.id,
    dashboard_id: targetDashboard.id,
    card: {
      row: 0,
      col: 0,
      size_x: 24,
      size_y: 8,
      parameter_mappings: [
        {
          parameter_id: TARGET_DASHBOARD_FILTER.id,
          card_id: targetQuestion.id,
          target: ["dimension", ["field", ORDERS.ID, null]],
        },
      ],
    },
  });

  // 3. the starting dashboard, whose card links to both of the above
  const startingDashboard = await createDashboard(api, {
    name: "Starting Dashboard",
    enable_embedding: true,
    embedding_type: "guest-embed",
  });

  const startingQuestion = await createQuestion(api, {
    name: "Orders for Starting Dashboard",
    query: { "source-table": ORDERS_ID, limit: 5 },
  });

  await addOrUpdateDashboardCard(api, {
    card_id: startingQuestion.id,
    dashboard_id: startingDashboard.id,
    card: {
      row: 0,
      col: 0,
      size_x: 24,
      size_y: 8,
      visualization_settings: {
        column_settings: {
          // ID column links to the target dashboard, with a parameter
          [`["ref",["field",${ORDERS.ID},null]]`]: {
            click_behavior: {
              type: "link",
              linkType: "dashboard",
              linkTextTemplate: "Go to Target Dashboard",
              targetId: targetDashboard.id,
              parameterMapping: {
                [TARGET_DASHBOARD_FILTER.id]: {
                  source: { type: "column", id: "ID", name: "ID" },
                  target: {
                    type: "parameter",
                    id: TARGET_DASHBOARD_FILTER.id,
                  },
                  id: TARGET_DASHBOARD_FILTER.id,
                },
              },
            },
          },
          // PRODUCT_ID column links to the native question, with a variable
          [`["ref",["field",${ORDERS.PRODUCT_ID},null]]`]: {
            click_behavior: {
              type: "link",
              linkType: "question",
              linkTextTemplate: "Go to Native Question",
              targetId: nativeQuestion.id,
              parameterMapping: {
                id: {
                  source: {
                    type: "column",
                    id: "PRODUCT_ID",
                    name: "Product ID",
                  },
                  target: { type: "variable", id: "id" },
                  id: "id",
                },
              },
            },
          },
        },
      },
    },
  });

  return {
    nativeQuestionId: nativeQuestion.id,
    targetDashboardId: targetDashboard.id,
    startingDashboardId: startingDashboard.id,
  };
}

/**
 * Port of the `<metabase-browser> breadcrumbs` describe's `beforeEach` body
 * (minus `prepareSdkIframeEmbedTest`): a "Target Dashboard" and a
 * "First Dashboard" whose ID column links to it.
 */
export async function setupBrowserBreadcrumbs(api: MetabaseApi): Promise<void> {
  const targetDashboard = await createDashboard(api, {
    name: "Target Dashboard",
  });

  const targetQuestion = await createQuestion(api, {
    name: "Orders in Target Dashboard",
    query: { "source-table": ORDERS_ID, limit: 5 },
  });

  await addOrUpdateDashboardCard(api, {
    card_id: targetQuestion.id,
    dashboard_id: targetDashboard.id,
    card: { row: 0, col: 0, size_x: 24, size_y: 8 },
  });

  const firstDashboard = await createDashboard(api, {
    name: "First Dashboard",
  });

  const dashQuestion = await createQuestion(api, {
    name: "Orders in First Dashboard",
    query: { "source-table": ORDERS_ID, limit: 5 },
  });

  await addOrUpdateDashboardCard(api, {
    card_id: dashQuestion.id,
    dashboard_id: firstDashboard.id,
    card: {
      row: 0,
      col: 0,
      size_x: 24,
      size_y: 8,
      visualization_settings: {
        column_settings: {
          [`["ref",["field",${ORDERS.ID},null]]`]: {
            click_behavior: {
              type: "link",
              linkType: "dashboard",
              linkTextTemplate: "Go to Target Dashboard",
              targetId: targetDashboard.id,
              parameterMapping: {},
            },
          },
        },
      },
    },
  });
}
