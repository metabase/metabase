import type { Frame, FrameLocator, Locator, Page } from "@playwright/test";

import { expect } from "./fixtures";
import SAMPLE_INSTANCE_DATA from "../../e2e/support/cypress_sample_instance_data.json";
import { USERS } from "./sample-data";
import {
  SIMPLE_EMBED_IFRAME_SELECTOR,
  getSignedJwtForUser,
} from "./sdk-iframe";
import { popover } from "./ui";

/**
 * Spec-local helper surface for the port of
 *   e2e/test/scenarios/embedding/sdk-iframe-embedding/sdk-iframe-embedding.cy.spec.ts
 *
 * PORTING rule 9: new module per agent — `support/sdk-iframe.ts` (the shared
 * harness) is consumed read-only from here and from the spec. Everything in
 * this file is either (a) a sample-instance id the shared `sample-data.ts`
 * does not yet export, or (b) a port of an `H` helper that only this tier
 * uses and that has to be scoped to a `FrameLocator` rather than the page.
 */

// === sample-instance ids not yet in support/sample-data.ts ===============

type InstanceQuestion = { id: number; name: string };
type InstanceDashboard = { id: number; name: string; entity_id?: string };

/** Port of ORDERS_COUNT_QUESTION_ID (cypress_sample_instance_data.js). */
export const ORDERS_COUNT_QUESTION_ID: number = (() => {
  const question = (
    SAMPLE_INSTANCE_DATA.questions as InstanceQuestion[]
  ).find((entity) => entity.name === "Orders, Count");
  if (!question) {
    throw new Error(
      'Question "Orders, Count" not found in cypress_sample_instance_data',
    );
  }
  return Number(question.id);
})();

/** Port of ORDERS_DASHBOARD_ENTITY_ID (cypress_sample_instance_data.js). */
export const ORDERS_DASHBOARD_ENTITY_ID: string = (() => {
  const dashboard = (
    SAMPLE_INSTANCE_DATA.dashboards as InstanceDashboard[]
  ).find((entity) => entity.name === "Orders in a dashboard");
  if (!dashboard?.entity_id) {
    throw new Error(
      'Dashboard "Orders in a dashboard" (with entity_id) not found in cypress_sample_instance_data',
    );
  }
  return dashboard.entity_id;
})();

// === the HTTPS mock JWT provider (production-origin tests) ===============

/**
 * `https` twin of the harness's `AUTH_PROVIDER_URL` (`http://auth-provider/sso`).
 *
 * Needed only by the three `analytics` tests, which serve the customer page
 * from a non-localhost origin. The harness has to upgrade such an origin to
 * `https://` to get past Chromium's Private Network Access rule (see
 * findings-inbox/sdk-iframe-harness.md §3b) — and an https document may not
 * fetch `http://auth-provider/sso`, which Chromium blocks as **mixed content**
 * before the request is ever made ("This request has been blocked; the content
 * must be served over HTTPS"). `http://localhost` is exempt as a potentially
 * trustworthy origin; `http://auth-provider` is not.
 *
 * Cypress never sees this either — `chromeWebSecurity: false` also disables the
 * mixed-content block. Same class as the two blockers already recorded for the
 * harness; the scheme is invisible to the behaviour under test, since the
 * provider is a mock whose URL the backend just hands back through
 * `GET /auth/sso`.
 */
export const HTTPS_AUTH_PROVIDER_URL = "https://auth-provider/sso";

/**
 * Points the instance's JWT provider at `HTTPS_AUTH_PROVIDER_URL` and mocks it.
 *
 * A port of the shared `enableJwtAuth` + `mockAuthProviderAndJwtSignIn` pair
 * with the scheme swapped; the shared module is consumed read-only, so this
 * re-registers rather than editing it. The CORS handling is the same as the
 * harness's (echo the caller's Origin, allow credentials) because the SDK
 * fetches the provider with `credentials: "include"`, for which a wildcard
 * `Access-Control-Allow-Origin` is rejected.
 */
export async function useHttpsMockJwtProvider(
  page: Page,
  mb: { api: { put(url: string, data?: unknown): Promise<unknown> } },
) {
  await mb.api.put("/api/setting", {
    "jwt-identity-provider-uri": HTTPS_AUTH_PROVIDER_URL,
  });

  await page.route(
    (url) => url.href.startsWith(HTTPS_AUTH_PROVIDER_URL),
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const requestOrigin =
        (await request.allHeaders()).origin ?? "http://localhost";
      const headers = {
        "content-type": "application/json",
        "access-control-allow-origin": requestOrigin,
        "access-control-allow-credentials": "true",
      };

      if (url.searchParams.get("response") !== "json") {
        await route.fulfill({
          status: 400,
          headers,
          body: JSON.stringify({
            error: "Invalid response parameter. Expected response=json",
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          jwt: getSignedJwtForUser({ user: USERS.admin }),
        }),
      });
    },
  );
}

// === iframe access =======================================================

/**
 * The embed iframe's `Frame` (not `FrameLocator`), for the two tests that need
 * `evaluate` inside the embed document — upstream reaches these through
 * `cy.get("iframe").its("0.contentWindow")`.
 *
 * `FrameLocator` deliberately has no `evaluate`, so this is the only way to
 * port an assertion about the iframe window's own state.
 */
export async function getEmbedFrame(page: Page, index = 0): Promise<Frame> {
  const handle = await page
    .locator(SIMPLE_EMBED_IFRAME_SELECTOR)
    .nth(index)
    .elementHandle();
  const frame = await handle?.contentFrame();
  if (!frame) {
    throw new Error(`No content frame for embed iframe #${index}`);
  }
  return frame;
}

// === request counters ====================================================

/**
 * Port of the `@getDashCardQuery` / `@getCardQuery` intercept aliases when the
 * spec reads `cy.get("@alias.all")` — i.e. uses them as a *counter* rather
 * than a wait. A passive `page.on("request")` counter is the shape PORTING
 * prescribes for "assert a request did / did not fire".
 */
export type RequestCounter = { count: number };

export function countDashCardQueries(page: Page): RequestCounter {
  return countRequests(
    page,
    (pathname) =>
      pathname.startsWith("/api/dashboard/") && pathname.endsWith("/query"),
  );
}

function countRequests(
  page: Page,
  matches: (pathname: string) => boolean,
): RequestCounter {
  const counter: RequestCounter = { count: 0 };
  page.on("request", (request) => {
    if (request.method() !== "POST") {
      return;
    }
    let pathname: string;
    try {
      pathname = new URL(request.url()).pathname;
    } catch {
      return;
    }
    if (matches(pathname)) {
      counter.count += 1;
    }
  });
  return counter;
}

/** Port of the `@getDashCardQuery` alias used as a wait. */
export function waitForDashCardQuery(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.startsWith("/api/dashboard/") &&
      new URL(response.url()).pathname.endsWith("/query"),
    { timeout: 60_000 },
  );
}

/** Port of the `@getCardQuery` alias used as a wait. */
export function waitForCardQuery(page: Page) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /^\/api\/card\/[^/]+\/query$/.test(new URL(response.url()).pathname),
    { timeout: 60_000 },
  );
}

// === ports of the H assertion helpers ====================================

/** Port of H.assertTableRowsCount, scoped to the embed frame. */
export async function assertTableRowsCount(
  scope: FrameLocator | Locator,
  value: number,
) {
  if (value > 0) {
    await expect(
      scope.getByTestId("table-body").getByRole("row").first(),
    ).toBeVisible({ timeout: 40_000 });
  }
  await expect(scope.getByTestId("table-root")).toHaveAttribute(
    "data-rows-count",
    String(value),
  );
}

/** Port of H.tableInteractive(), scoped. */
export function tableInteractive(scope: FrameLocator | Locator): Locator {
  return scope.getByTestId("table-root");
}

/**
 * Port of the repeated "dashboard rendered" block:
 *   findByText("Orders in a dashboard") / findByText("Orders") /
 *   H.assertTableRowsCount(2000)
 */
export async function assertOrdersDashboardVisible(frame: FrameLocator) {
  await expect(
    frame.getByText("Orders in a dashboard", { exact: true }),
  ).toBeVisible({ timeout: 40_000 });
  await expect(frame.getByText("Orders", { exact: true })).toBeVisible();
  await assertTableRowsCount(frame, 2000);
}

/**
 * Port of H.assertSdkInteractiveQuestionOrdersUsable
 * (e2e/support/helpers/e2e-embedding-sdk-assertion-helpers.ts).
 */
export async function assertSdkInteractiveQuestionOrdersUsable(
  frame: FrameLocator,
) {
  // `.first()`: upstream's findByText resolves against the DOM as it stands at
  // that instant; by the time Playwright resolves, the question title and the
  // table's own "Orders" breadcrumb can both be present. The assertion's
  // intent is "an exact 'Orders' is visible".
  await expect(
    frame.getByText("Orders", { exact: true }).first(),
  ).toBeVisible({ timeout: 40_000 });

  // 1. shows a table
  await expect(
    tableInteractive(frame).getByText("Total", { exact: true }),
  ).toBeVisible();
  await expect(
    tableInteractive(frame).getByText("37.65", { exact: true }).first(),
  ).toBeVisible();

  await frame.getByTestId("chart-type-selector-button").click();

  // 2. can switch to a trend chart
  await frame.getByRole("listbox").getByText("Trend", { exact: true }).click();

  await expect(frame.getByText("2000", { exact: true })).toBeVisible();
}

/**
 * Port of H.assertSdkNotebookEditorUsable
 * (e2e/support/helpers/e2e-embedding-sdk-assertion-helpers.ts).
 */
export async function assertSdkNotebookEditorUsable(frame: FrameLocator) {
  await expect(frame.getByText("Orders", { exact: true }).first()).toBeVisible({
    timeout: 40_000,
  });

  // Upstream comment: "Using `cy.contains` does not work in the iframe" — so it
  // passes the frame root explicitly. `cy.contains` is a case-sensitive
  // substring match.
  await expect(frame.getByText(/Pick your starting data/)).toBeVisible();

  await popover(frame).getByText("Orders", { exact: true }).click();

  await frame.getByRole("button", { name: "Visualize", exact: true }).click();

  // Should not show a loading indicator again as the question has not changed
  // (metabase#47564)
  await expect(frame.getByTestId("loading-indicator")).toHaveCount(0);

  // Should show a visualization after clicking "Visualize" and should not show
  // an error message (metabase#55398)
  await expect(frame.getByText("Question not found", { exact: true })).toHaveCount(
    0,
  );
  await expect(frame.getByText("110.93", { exact: true })).toBeVisible({
    timeout: 40_000,
  });
}
