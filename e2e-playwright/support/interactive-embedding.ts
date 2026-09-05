/**
 * Interactive (full-app) embedding helpers for the
 * interactive-embedding.cy.spec.js port.
 *
 * visitFullAppEmbeddingUrl is a GENERALIZED COPY of the iframe harness in
 * support/search.ts. TODO(consolidation): merge the harnesses. Differences
 * added here (all upstream-compatible):
 * - `qs` is optional (the spec often visits with no params);
 * - the target url is built with the URL API, so query params land BEFORE
 *   the hash (the spec visits `/question#<adhoc-hash>` with params —
 *   string concatenation in search.ts would append them after the hash);
 * - the harness page records incoming `message` events (the harness IS the
 *   embed's window.parent, so this observes the app's postMessage protocol
 *   exactly where a real embedding host would);
 * - Set-Cookie headers on proxied documents are applied to the browser
 *   context via getSetCookie() instead of being forwarded (undici merges
 *   multiple Set-Cookie headers into one comma-joined string, which
 *   corrupts the JWT SSO flow's session cookies), and redirects (3xx) are
 *   fulfilled as-is so the browser follows them inside the iframe.
 *
 * Also contains scope-generic copies of Page-only helpers from ui.ts /
 * notebook.ts / dashboard.ts / models.ts (flagged for consolidation): the
 * whole spec interacts through a FrameLocator, which those modules' Page
 * signatures don't accept.
 */
import { createHmac } from "node:crypto";

import { expect } from "@playwright/test";
import type {
  Frame,
  FrameLocator,
  Locator,
  Page,
  Response,
  Route,
} from "@playwright/test";

import type { MetabaseApi } from "./api";
import { SAMPLE_DB_ID } from "./sample-data";
// popover/icon/modal/goToTab are canonical in ui.ts (its Scope type covers the
// embedding FrameLocator); popover is imported because it's used internally too.
import { popover } from "./ui";

type Scope = Page | FrameLocator;

// === the iframe harness ===

const HARNESS_PATH = "/__pw-embed-harness__";

/** Response headers that must not be forwarded when fulfilling a proxied
 * document: the two frame-blockers, encoding headers that no longer match
 * the (already decompressed) body, and set-cookie (applied to the browser
 * context directly — see applySetCookies). */
const DROPPED_RESPONSE_HEADERS = new Set([
  "x-frame-options",
  "content-security-policy",
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "set-cookie",
]);

/** Pages that already have the document-proxy route installed. */
const documentRouteInstalled = new WeakSet<Page>();

async function applySetCookies(
  page: Page,
  response: globalThis.Response,
  baseUrl: string,
) {
  const setCookies = response.headers.getSetCookie();
  if (setCookies.length === 0) {
    return;
  }
  await page.context().addCookies(
    setCookies.map((cookie) => {
      const [pair] = cookie.split(";");
      const separator = pair.indexOf("=");
      return {
        name: pair.slice(0, separator).trim(),
        value: pair.slice(separator + 1).trim(),
        url: baseUrl,
      };
    }),
  );
}

/**
 * Fulfill a route with a redirect that the browser re-requests from scratch.
 *
 * **Playwright does not run route handlers for the follow-up request of a
 * redirect.** Verified directly: with one `page.route` registered for
 * `http://localhost:8888`, a `page.goto` straight there hits the handler, but
 * the identical URL arrived at via a 302 skips every handler (including a
 * `() => true` catch-all) and goes to the real network — surfacing as
 * `net::ERR_CONNECTION_REFUSED` when nothing is listening.
 *
 * Cypress never hits this: its proxy sits in front of every hop, so a mocked
 * IdP keeps working across redirects. The JWT SSO flow redirects four times
 * (/dashboard → /auth/sso → IdP → /auth/sso?jwt → /dashboard) and EVERY hop
 * has to stay intercepted — the app-origin ones to strip X-Frame-Options, the
 * IdP one because it's a mock and nothing is actually listening on :8888.
 *
 * So emulate the redirect client-side: a document whose `location.replace()`
 * issues a *fresh* navigation, which Playwright does route. `replace` (not
 * `assign`) leaves history identical to a real redirect.
 */
async function fulfillAsClientRedirect(route: Route, location: string) {
  // < so a "</script>" in the URL can't break out of the script element.
  const target = JSON.stringify(location).replace(/</g, "\\u003c");
  await route.fulfill({
    status: 200,
    contentType: "text/html",
    body: `<!doctype html><script>location.replace(${target})</script>`,
  });
}

/**
 * Mock an external redirect (e.g. a JWT/SAML IdP bouncing back to the app).
 * Use instead of `route.fulfill({ status: 302, headers: { location } })` —
 * see fulfillAsClientRedirect for why a real 302 breaks the next hop's mock.
 */
export function mockRedirectResponse(route: Route, location: string) {
  return fulfillAsClientRedirect(route, location);
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

export async function visitFullAppEmbeddingUrl(
  page: Page,
  {
    url,
    qs = {},
    // Per-worker-backend mode overrides the test's baseURL, so the static
    // BASE_URL would point the iframe at the wrong backend — required here.
    baseUrl,
  }: {
    url: string;
    qs?: Record<string, string | number | boolean>;
    baseUrl: string;
  },
): Promise<FrameLocator> {
  // Chromium's Private Network Access rules block the framed app's requests
  // to local addresses because the fulfilled document has no IP address
  // space; granting the permission to the app origin lifts that.
  await page
    .context()
    .grantPermissions(["local-network-access"], { origin: baseUrl });

  // The backend sends X-Frame-Options: DENY and frame-ancestors 'none';
  // Cypress's proxy strips those headers, so strip them from document
  // requests here. Native fetch instead of route.fetch(): the latter chokes
  // on the backend's set-cookie headers when the runner is bun.
  if (!documentRouteInstalled.has(page)) {
    documentRouteInstalled.add(page);
    await page.route(
      (routeUrl) =>
        routeUrl.href.startsWith(baseUrl) && routeUrl.pathname !== HARNESS_PATH,
      async (route) => {
        if (route.request().resourceType() !== "document") {
          return route.fallback();
        }
        const request = route.request();
        const response = await fetch(request.url(), {
          headers: await request.allHeaders(),
          redirect: "manual",
        });
        await applySetCookies(page, response, baseUrl);
        const location = response.headers.get("location");
        if (response.status >= 300 && response.status < 400 && location) {
          return fulfillAsClientRedirect(
            route,
            new URL(location, request.url()).href,
          );
        }
        const headers: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          if (!DROPPED_RESPONSE_HEADERS.has(key)) {
            headers[key] = value;
          }
        });
        await route.fulfill({
          status: response.status,
          headers,
          body: Buffer.from(await response.arrayBuffer()),
        });
      },
    );
  }

  const target = new URL(url, baseUrl);
  for (const [key, value] of Object.entries(qs)) {
    target.searchParams.set(key, String(value));
  }

  // The harness page must live on the app origin: a setContent page is not a
  // secure context, so Chromium blocks the iframe's local-network requests.
  // The inline script records the embed's postMessages — the harness page is
  // the embed's real window.parent (see recordedPostMessages).
  const harnessUrl = `${baseUrl}${HARNESS_PATH}`;
  // Re-visits within a test re-register the route; drop the stale handler.
  await page.unroute(harnessUrl);
  await page.route(harnessUrl, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><body style="margin:0"><script>window.__pwMessages = []; window.addEventListener("message", (event) => window.__pwMessages.push(event.data));</script><iframe id="embed" name="embed" src="${escapeHtmlAttribute(target.href)}" style="width:100%;height:100vh;border:0"></iframe></body></html>`,
    }),
  );
  await page.goto(harnessUrl);
  return page.frameLocator("#embed");
}

/** The Frame behind visitFullAppEmbeddingUrl, for URL assertions.
 * COPY of search.ts embedFrame — TODO(consolidation). */
export function embedFrame(page: Page): Frame {
  const frame = page.frame("embed");
  if (!frame) {
    throw new Error(
      "embed iframe not found — call visitFullAppEmbeddingUrl first",
    );
  }
  return frame;
}

// === postMessage plumbing (harness page = the embed's window.parent) ===

type HarnessWindow = Window & { __pwMessages?: unknown[] };

/** Messages the embed posted to its parent since the last harness load /
 * clearRecordedPostMessages call (port of the cy.spy on window.parent). */
export function recordedPostMessages(page: Page): Promise<unknown[]> {
  return page.evaluate(() => (window as HarnessWindow).__pwMessages ?? []);
}

/** Port of cy.get("@postMessage").invoke("resetHistory"). */
export async function clearRecordedPostMessages(page: Page) {
  await page.evaluate(() => {
    (window as HarnessWindow).__pwMessages = [];
  });
}

type FrameMessage = {
  metabase?: { type?: string; frame?: { mode?: string; height?: number } };
};

/**
 * Port of `cy.get("@postMessage").should("have.been.calledWith", {metabase:
 * {type: "frame", frame: {mode: "fit", height: sinon.match(pred)}}})`:
 * poll the recorded messages for a fit-mode frame message whose height
 * satisfies the predicate.
 */
export async function expectFrameHeightMessage(
  page: Page,
  heightPredicate: (height: number) => boolean,
) {
  await expect
    .poll(async () => {
      const messages = (await recordedPostMessages(page)) as FrameMessage[];
      const frames = messages
        .filter((message) => message?.metabase?.type === "frame")
        .map((message) => message.metabase?.frame);
      const matched = frames.some(
        (frame) =>
          frame?.mode === "fit" &&
          typeof frame.height === "number" &&
          heightPredicate(frame.height),
      );
      // On a miss, return the frames actually posted rather than `false`:
      // the poll failure then names the reason (wrong mode? wrong height?
      // none sent at all?) instead of printing a bare `expected true`.
      return matched ? true : frames;
    })
    .toBe(true);
}

/**
 * Port of H.postMessageToIframe. The Cypress helper hand-crafts a
 * MessageEvent because its test window isn't the iframe's parent; here the
 * harness page IS window.parent, so a plain postMessage from it satisfies
 * the `event.source === window.parent` check in the app's
 * interactive-embedding initialize code.
 */
export async function postMessageToEmbed(page: Page, messageData: unknown) {
  await page.evaluate((data) => {
    // Justified cast: #embed is the harness iframe by construction.
    const iframe = document.getElementById("embed") as HTMLIFrameElement;
    iframe.contentWindow?.postMessage(data, "*");
  }, messageData);
}

// === cy.wait alias-queue equivalent ===

/**
 * Port of Cypress intercept alias semantics: matching responses are recorded
 * from construction on, and next() consumes them in arrival order (cy.wait
 * resolves instantly for already-received responses — waitForResponse
 * doesn't, which breaks verify-after-action call sites like
 * verifyTableSelected).
 */
export class ResponseQueue {
  private responses: Response[] = [];
  private waiters: {
    resolve: (response: Response) => void;
    timer: ReturnType<typeof setTimeout>;
  }[] = [];

  constructor(
    page: Page,
    private predicate: (response: Response) => boolean,
    private label: string,
  ) {
    page.on("response", (response) => {
      if (!this.predicate(response)) {
        return;
      }
      const waiter = this.waiters.shift();
      if (waiter) {
        clearTimeout(waiter.timer);
        waiter.resolve(response);
      } else {
        this.responses.push(response);
      }
    });
  }

  next(timeout = 30_000): Promise<Response> {
    const queued = this.responses.shift();
    if (queued) {
      return Promise.resolve(queued);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(new Error(`Timed out waiting for a "${this.label}" response`)),
        timeout,
      );
      this.waiters.push({ resolve, timer });
    });
  }
}

// === scope-generic UI helpers (copies of Page-only helpers — see header) ===

/** COPY of ui.ts appBar, accepting a FrameLocator scope. */
export function appBar(scope: Scope): Locator {
  return scope.getByLabel("Navigation bar");
}

/** Port of the spec-local sideNav(). */
export function sideNav(scope: Scope): Locator {
  return scope.getByTestId("main-navbar-root");
}

/** icon/modal/goToTab live in ui.ts; popover is imported above and re-exported. */
export { icon, modal, goToTab } from "./ui";
export { popover };

/** COPY of notebook.ts getNotebookStep, accepting a FrameLocator scope. */
export function getNotebookStep(
  scope: Scope,
  type: string,
  { stage = 0, index = 0 } = {},
): Locator {
  return scope.getByTestId(`step-${type}-${stage}-${index}`);
}

/** COPY of dashboard.ts getDashboardCard, accepting a FrameLocator scope. */
export function getDashboardCard(scope: Scope, index = 0): Locator {
  return scope.getByTestId("dashcard-container").nth(index);
}

/** COPY of drillthroughs.ts dashboardGrid, accepting a FrameLocator scope. */
export function dashboardGrid(scope: Scope): Locator {
  return scope.getByTestId("dashboard-grid");
}

/** Port of H.dashboardHeader, accepting a FrameLocator scope. */
export function dashboardHeader(scope: Scope): Locator {
  return scope.getByTestId("dashboard-header");
}

/** Port of H.goToTab (e2e-dashboard-helpers.ts). */

/**
 * COPY of native-extras.ts assertTableRowsCount, accepting any scope (the
 * spec runs it inside H.dashboardGrid().within(...)).
 */
export async function assertTableRowsCount(
  scope: Scope | Locator,
  value: number,
) {
  if (value > 0) {
    await expect(
      scope.getByTestId("table-body").getByRole("row").first(),
    ).toBeVisible();
  }
  await expect(scope.getByTestId("table-root")).toHaveAttribute(
    "data-rows-count",
    String(value),
  );
}

/**
 * Port of cy.findByDisplayValue(value): retried scan of the scope's form
 * controls' live value properties (the value attribute doesn't track
 * user/React updates, so a CSS [value=...] locator can't be used).
 *
 * Matches input/textarea/select — the same set testing-library's ByDisplayValue
 * queries. `input` alone is not enough: Metabase's EditableText (question and
 * dashboard titles) renders a <textarea>, so an input-only scan silently finds
 * nothing on exactly the titles this is usually pointed at.
 */
export async function expectInputWithValue(scope: Scope, value: string) {
  await expect
    .poll(() =>
      scope
        .locator("input, textarea, select")
        .evaluateAll((controls) =>
          controls.map(
            (control) =>
              (control as HTMLInputElement | HTMLTextAreaElement).value,
          ),
        ),
    )
    .toContain(value);
}

/**
 * Port of the dashcard-menu CSV export path: H.exportFromDashcard(".csv")
 * with the dashcard menu already open (COPY of downloads.ts
 * exportFromDashcard, frame-scoped, resolving with the export response
 * instead of the Download — the spec asserts on the request headers).
 */
export async function exportDashcardCsv(
  page: Page,
  frame: FrameLocator,
): Promise<Response> {
  await frame.getByLabel("Download results", { exact: true }).click();
  const menu = popover(frame);
  await menu.getByText(".csv", { exact: true }).click();
  const csvResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /^\/api\/dashboard\/\d+\/dashcard\/\d+\/card\/\d+\/query\/csv$/.test(
        new URL(response.url()).pathname,
      ),
  );
  await menu.getByTestId("download-results-button").click();
  return csvResponse;
}

// === API helpers ===

/**
 * Port of cy.updateCollectionGraph (support/commands/permissions):
 * GET the graph, merge the group entries, PUT it back.
 */
export async function updateCollectionGraph(
  api: MetabaseApi,
  groups: Record<number, Record<number | string, string>>,
) {
  const response = await api.get("/api/collection/graph");
  const graph = (await response.json()) as {
    groups: Record<string, unknown>;
    revision: number;
  };
  await api.put("/api/collection/graph", {
    groups: { ...graph.groups, ...groups },
    revision: graph.revision,
  });
}

/** Port of the spec-local addLinkClickBehavior. */
export async function addLinkClickBehavior(
  api: MetabaseApi,
  { dashboardId, linkTemplate }: { dashboardId: number; linkTemplate: string },
) {
  const response = await api.get(`/api/dashboard/${dashboardId}`);
  const { dashcards } = (await response.json()) as {
    dashcards: Record<string, unknown>[];
  };
  await api.put(`/api/dashboard/${dashboardId}`, {
    dashcards: dashcards.map((card) => ({
      ...card,
      visualization_settings: {
        click_behavior: {
          type: "link",
          linkType: "url",
          linkTemplate,
        },
      },
    })),
  });
}

// createDashboardWithTabs is now canonical in ./factories (tabs optional there
// too); re-exported so this module's consumers keep their import unchanged.
export { createDashboardWithTabs } from "./factories";

/** Port of H.updateDashboardCards (PUT the dashcards array). */
export async function updateDashboardCards(
  api: MetabaseApi,
  {
    dashboard_id,
    cards,
  }: { dashboard_id: number; cards: Record<string, unknown>[] },
) {
  await api.put(`/api/dashboard/${dashboard_id}`, { dashcards: cards });
}

/** Port of H.getNextUnsavedDashboardCardId (e2e-dashboard-helpers.ts). */
export const getNextUnsavedDashboardCardId = (() => {
  let id = 0;
  return () => --id;
})();

/**
 * Local stand-in for createMockDashboardCard (metabase-types/api/mocks) —
 * same positional defaults the API cares about.
 */
export function mockDashboardCard(
  opts: { card_id: number | null } & Record<string, unknown>,
): Record<string, unknown> {
  return {
    id: getNextUnsavedDashboardCardId(),
    row: 0,
    col: 0,
    size_x: 1,
    size_y: 1,
    visualization_settings: {},
    parameter_mappings: [],
    ...opts,
  };
}

/** Port of H.getTextCardDetails / createMockTextDashboardCard (the virtual
 * text-card dashcard shape). */
export function getTextCardDetails({
  col = 0,
  row = 0,
  size_x = 4,
  size_y = 6,
  text = "Text card",
  ...cardDetails
}: Record<string, unknown> & {
  col?: number;
  row?: number;
  size_x?: number;
  size_y?: number;
  text?: string;
} = {}): Record<string, unknown> {
  return {
    id: getNextUnsavedDashboardCardId(),
    card_id: null,
    col,
    row,
    size_x,
    size_y,
    visualization_settings: {
      virtual_card: {
        name: null,
        display: "text",
        visualization_settings: {},
        dataset_query: {},
        archived: false,
      },
      text,
    },
    ...cardDetails,
  };
}

/**
 * Port of H.createDocument (createMockDocument + POST /api/document),
 * keeping the document content the comments test needs.
 * TODO(consolidation): command-palette.ts createDocument only accepts
 * name/collection_id.
 */
export async function createDocument(
  api: MetabaseApi,
  { name, document }: { name: string; document: Record<string, unknown> },
): Promise<{ id: number }> {
  const response = await api.post("/api/document", { name, document });
  return (await response.json()) as { id: number };
}

/** Port of H.createComment (api/createComment.ts). */
export async function createComment(
  api: MetabaseApi,
  details: {
    target_type: string;
    target_id: number;
    child_target_id: string;
    parent_comment_id: number | null;
    content: Record<string, unknown>;
  },
) {
  await api.post("/api/comment", details);
}

/** Port of H.getTableId (e2e-qa-databases-helpers.js). */
export async function getTableId(
  api: MetabaseApi,
  { databaseId = 2, name }: { databaseId?: number; name: string },
): Promise<number> {
  const response = await api.get(`/api/database/${databaseId}/metadata`);
  const body = (await response.json()) as {
    tables?: { id: number; name: string }[];
  };
  const table = body.tables?.find((table) => table.name === name);
  if (!table) {
    throw new Error(`Table "${name}" not found in database ${databaseId}`);
  }
  return table.id;
}

/** Port of H.createModelFromTableName (e2e-qa-databases-helpers.js). */
export async function createModelFromTableName(
  api: MetabaseApi,
  {
    tableName,
    modelName = "Test Action Model",
    databaseId = 2,
  }: { tableName: string; modelName?: string; databaseId?: number },
) {
  const tableId = await getTableId(api, { databaseId, name: tableName });
  await api.post("/api/card", {
    name: modelName,
    type: "model",
    display: "table",
    visualization_settings: {},
    dataset_query: {
      type: "query",
      query: { "source-table": tableId },
      database: databaseId,
    },
  });
}

/**
 * Port of cy.task("signJwt") (e2e/support/commands/embedding/signJwt or the
 * jsonwebtoken-based task): a minimal HS256 signer — same UTF-8 string
 * secret semantics as jsonwebtoken and the backend's buddy-sign.
 */
export function signJwt(
  payload: Record<string, unknown>,
  secret: string,
): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const data = `${encode({ alg: "HS256", typ: "JWT" })}.${encode(payload)}`;
  const signature = createHmac("sha256", secret)
    .update(data)
    .digest("base64url");
  return `${data}.${signature}`;
}

// === sample-data constants not exported by support/sample-data.ts ===

/** Mirrors ALL_USERS_GROUP in e2e/support/cypress_data.js (fixed id baked
 * into the snapshots). */
export const ALL_USERS_GROUP = 1;

export { SAMPLE_DB_ID };
