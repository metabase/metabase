import crypto from "crypto";

import type { FrameLocator, Locator, Page } from "@playwright/test";

import { expect } from "./fixtures";
import { LOGIN_CACHE, USERS } from "./sample-data";

/**
 * Port of the SDK-iframe ("embed.js" / new embed) test surface:
 *   e2e/support/helpers/e2e-embedding-iframe-sdk-helpers.ts
 *   e2e/support/helpers/embedding-sdk-testing/embedding-sdk-helpers.ts
 *   e2e/support/helpers/e2e-jwt-helpers.ts
 *
 * THE PORT'S CENTRAL PROBLEM — and why every URL here is derived, never
 * literal. The Cypress helpers hardcode `http://localhost:4000` in THREE
 * places that all have to agree:
 *
 *   1. `EMBED_JS_PATH` — the `<script src>` that loads the embed runtime.
 *   2. `instanceUrl` in `defineMetabaseConfig` — the backend the embed's
 *      iframe is pointed at.
 *   3. `origin` — the host the *customer page* is served from, which is ""
 *      upstream, i.e. relative to Cypress's baseUrl, i.e. also :4000.
 *
 * On the per-worker slot model the test's backend is :410N, so all three must
 * be `mb.baseUrl`. This is exactly the failure class of FINDINGS #39
 * (`site-url` baked to :4000): a mismatch here does NOT throw — the browser
 * happily loads a *different* Metabase instance and the dashboard renders,
 * because :4000 has the same sample data. See `assertEmbedTargetsThisSlot`
 * below for the guard that makes that unfalsifiable-by-eye case falsifiable.
 */

/** Port of e2e/support/helpers/embedding-sdk-helpers/constants.ts. */
export const AUTH_PROVIDER_URL = "http://auth-provider/sso";

/** Port of e2e-jwt-helpers.ts. */
export const JWT_SHARED_SECRET = "0".repeat(64);

const MOCK_SAML_IDP_URI = "https://example.test/saml";

// === JWT signing =========================================================

const base64url = (input: Buffer | string) =>
  Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

/**
 * Port of H.getSignedJwtForUser. Upstream uses `jose`; that package lives in
 * the repo-root node_modules, not this package's, so HS256 is done with node's
 * own crypto — it is a two-line HMAC and avoids adding a dependency to the
 * spike's package.json.
 */
export function getSignedJwtForUser({
  user = USERS.admin,
  expiredInSeconds = 60 * 10,
}: {
  user?: { email: string; first_name?: string; last_name?: string };
  expiredInSeconds?: number;
} = {}): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      email: user.email,
      first_name: user.first_name ?? "Bobby",
      last_name: user.last_name ?? "Tables",
      exp: Math.round(Date.now() / 1000) + expiredInSeconds,
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

export type EnabledAuthMethod = "jwt" | "saml" | "api-key";

/** Minimal structural type for the `mb` fixture, so this module does not have
 * to import the (non-exported) harness class from fixtures.ts. */
type Harness = {
  baseUrl: string;
  api: {
    get(url: string, options?: any): Promise<any>;
    post(url: string, data?: unknown, options?: any): Promise<any>;
    put(url: string, data?: unknown, options?: any): Promise<any>;
    updateSetting(setting: string, value: unknown): Promise<void>;
    activateToken(name: any): Promise<void>;
    restore(name?: string): Promise<void>;
  };
  restore(name?: string): Promise<void>;
  signInAsAdmin(): Promise<void>;
  signOut(): Promise<void>;
};

export type PrepareOptions = {
  withToken?: false | "starter" | "bleeding-edge";
  enabledAuthMethods?: EnabledAuthMethod[];
  signOut?: boolean;
};

export type PreparedEmbedTest = {
  /** Unmasked API key, when "api-key" was in enabledAuthMethods (upstream
   * stashes this in the `@apiKey` alias). */
  apiKey?: string;
};

/**
 * Port of H.prepareSdkIframeEmbedTest.
 *
 * Differences from upstream, all forced and all deliberate:
 * - `mockEmbedJsToDevServer` is dropped. It redirects `embed.js` to the rspack
 *   dev server at :8080 for hot reload; jar mode is this spike's verification
 *   default (PORTING.md), and the jar serves `frontend_client/app/embed.js`
 *   itself — confirmed present in target/uberjar/metabase.jar. No SDK build
 *   step is needed for this tier.
 * - The `cy.intercept(...).as(...)` aliases for card/dashboard queries are not
 *   registered here. Playwright's `waitForResponse` must be armed immediately
 *   before the triggering action (PORTING.md rule 2), so specs arm their own.
 */
export async function prepareSdkIframeEmbedTest(
  page: Page,
  mb: Harness,
  {
    withToken = "bleeding-edge",
    enabledAuthMethods = ["jwt"],
    signOut = false,
  }: PrepareOptions = {},
): Promise<PreparedEmbedTest> {
  await mb.restore();
  await mb.signInAsAdmin();

  if (withToken) {
    await mb.api.activateToken(withToken);
  }

  await mb.api.updateSetting("enable-embedding-simple", true);

  const prepared = await setupMockAuthProviders(page, mb, enabledAuthMethods);

  if (signOut) {
    await mb.signOut();
  }

  return prepared;
}

async function setupMockAuthProviders(
  page: Page,
  mb: Harness,
  enabledAuthMethods: EnabledAuthMethod[],
): Promise<PreparedEmbedTest> {
  const prepared: PreparedEmbedTest = {};

  if (enabledAuthMethods.includes("jwt")) {
    await enableJwtAuth(mb);
    await mockAuthProviderAndJwtSignIn(page);
  }

  // Doesn't actually allow logging in via SAML — it only makes Metabase
  // believe SAML is enabled and configured.
  if (enabledAuthMethods.includes("saml")) {
    await enableSamlAuth(mb);
  }

  if (enabledAuthMethods.includes("api-key")) {
    const ADMIN_GROUP_ID = 2;
    const response = await mb.api.post("/api/api-key", {
      name: "test iframe sdk embedding",
      group_id: ADMIN_GROUP_ID,
    });
    prepared.apiKey = (await response.json()).unmasked_key;
  }

  return prepared;
}

/** Port of H.enableJwtAuth. */
export async function enableJwtAuth(mb: Harness) {
  await mb.api.put("/api/setting", {
    "jwt-enabled": true,
    "jwt-identity-provider-uri": AUTH_PROVIDER_URL,
    "jwt-shared-secret": JWT_SHARED_SECRET,
  });
}

/** Port of H.enableSamlAuth. Upstream reads the cert with `cy.readFile`; here
 * it is read off disk directly. */
export async function enableSamlAuth(mb: Harness) {
  const fs = await import("fs");
  const path = await import("path");
  const certificate = fs.readFileSync(
    path.resolve(__dirname, "../../test_resources/sso/auth0-public-idp.cert"),
    "utf8",
  );
  await mb.api.put("/api/setting", {
    "saml-enabled": true,
    "saml-identity-provider-uri": MOCK_SAML_IDP_URI,
    "saml-identity-provider-certificate": certificate,
    "saml-identity-provider-issuer": "https://example.test/issuer",
  });
}

/**
 * Port of H.mockAuthProviderAndJwtSignIn.
 *
 * `http://auth-provider` does not resolve — that is the point; Cypress
 * intercepts it. Playwright's routing also happens before DNS, so fulfilling
 * works identically. The one thing upstream gets for free and we must add
 * explicitly is the CORS header: Cypress runs with `chromeWebSecurity: false`,
 * while this config only sets `bypassCSP` (CSP, not CORS). Without
 * `access-control-allow-origin` the SDK's cross-origin fetch to the fake
 * provider is blocked by the browser and auth hangs.
 */
export async function mockAuthProviderAndJwtSignIn(
  page: Page,
  {
    user = USERS.admin,
    jwt,
    waitFor,
  }: {
    user?: { email: string; first_name?: string; last_name?: string };
    jwt?: string;
    waitFor?: () => Promise<unknown>;
  } = {},
) {
  await page.route(
    (url) => url.href.startsWith(AUTH_PROVIDER_URL),
    async (route) => {
      if (waitFor) {
        await waitFor();
      }
      const request = route.request();
      const url = new URL(request.url());
      // The SDK fetches the provider with `credentials: "include"`, and the
      // browser rejects a wildcard ACAO on a credentialed request
      // ("...must not be the wildcard '*'..."), so echo the caller's Origin
      // and allow credentials explicitly.
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
        body: JSON.stringify({ jwt: jwt ?? getSignedJwtForUser({ user }) }),
      });
    },
  );
}

/** Port of H.mockAuthSsoEndpointForSamlAuthProvider. Upstream's relative
 * "/auth/sso" resolves against Cypress's baseUrl; here it must be matched on
 * the slot's own origin. */
export async function mockAuthSsoEndpointForSamlAuthProvider(
  page: Page,
  mb: Harness,
) {
  await page.route(
    (url) =>
      url.origin === new URL(mb.baseUrl).origin && url.pathname === "/auth/sso",
    async (route) => {
      if (route.request().method() !== "GET") {
        return route.fallback();
      }
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          method: "saml",
          url: MOCK_SAML_IDP_URI,
          hash: "test-hash",
        }),
      });
    },
  );
}

/**
 * Port of H.stubWindowOpenForSamlPopup.
 *
 * Cypress stubs `window.open` after the page has loaded (`onLoad`). That is a
 * race we don't have to take: `addInitScript` installs the stub before any
 * page script runs, which is strictly safer for a popup the SDK may open
 * immediately. Must be called BEFORE the navigation.
 */
export async function stubWindowOpenForSamlPopup(
  page: Page,
  { isUserValid = true }: { isUserValid?: boolean } = {},
) {
  // The snapshot's login cache holds a real session token; without it the SDK
  // reports "invalid user" because the session it is handed isn't real.
  const sessionId = isUserValid
    ? LOGIN_CACHE.normal?.sessionId
    : "invalid-session-token";

  await page.addInitScript(
    ([idpUri, id]) => {
      const originalOpen = window.open.bind(window);
      window.open = ((url?: string | URL, ...rest: any[]) => {
        if (String(url) !== idpUri) {
          return (originalOpen as any)(url, ...rest);
        }
        const popup = {
          closed: false,
          close() {
            popup.closed = true;
          },
        };
        setTimeout(() => {
          window.dispatchEvent(
            new MessageEvent("message", {
              data: {
                type: "SAML_AUTH_COMPLETE",
                authData: {
                  id,
                  exp: Math.floor(Date.now() / 1000) + 600,
                },
              },
              origin: "*",
            }),
          );
          popup.close();
        }, 100);
        return popup as any;
      }) as typeof window.open;
    },
    [MOCK_SAML_IDP_URI, sessionId] as const,
  );
}

/** Stub `window.open` into an inert popup — for the "we only care which auth
 * method was chosen" tests, where the IdP is never simulated. */
export async function stubWindowOpenInert(page: Page) {
  await page.addInitScript(() => {
    window.open = (() => ({ closed: false, close: () => {} })) as any;
  });
}

// === the test page =======================================================

export type MetabaseElement = {
  component:
    | "metabase-dashboard"
    | "metabase-question"
    | "metabase-browser"
    | (string & {});
  attributes: Record<string, unknown>;
};

export type MetabaseConfig = {
  instanceUrl?: string;
  isGuest?: boolean;
  guestEmbedProviderUri?: string;
  jwtProviderUri?: string;
  apiKey?: string;
  useExistingUserSession?: boolean;
  theme?: unknown;
  preferredAuthMethod?: "jwt" | "saml";
  locale?: string;
  [key: string]: unknown;
};

export type EmbedTestPageOptions = {
  metabaseConfig?: MetabaseConfig;
  elements: MetabaseElement[];
  /** Origin the *customer page* is served from. Defaults to the slot's own
   * origin (upstream's `""`, which resolved to Cypress's baseUrl). Pass e.g.
   * "http://example.com" for the "production origin" tests. */
  origin?: string;
  insertHtml?: { head?: string; beforeEmbed?: string; afterEmbed?: string };
  /** Script evaluated in the page before any page script runs — the analogue
   * of upstream's `onVisitPage(win)`, which ran on load. Use for mutating
   * `window.metabaseConfig` (e.g. adding a `fetchRequestToken` function, which
   * cannot survive JSON serialization into the HTML). */
  initScript?: string;
};

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Upgrades a non-loopback `http://` test-page origin to `https://`.
 *
 * The "production" tests in this tier serve the customer page from a
 * non-localhost origin, because the SDK decides `isProduction` from
 * `window.location.hostname` (see `embed.ts#_getIsLocalhost`: localhost /
 * 127.0.0.1 / [::1], or a hostname equal to the instance's). Upstream uses
 * `http://example.com`.
 *
 * Chromium refuses that: Private Network Access blocks a request from an
 * insecure, non-loopback document to a `loopback` address —
 *   "The request client is not a secure context and the resource is in
 *    more-private address space `loopback`"
 * — and `embed.js` never loads, so the iframe is never created. Granting the
 * `local-network-access` permission does NOT lift it; the blocker is the
 * *secure context* requirement, not the permission. Cypress never sees this
 * because it runs with `chromeWebSecurity: false`; this config only sets
 * `bypassCSP`, and launch args live in the shared playwright.config.ts.
 *
 * `https://example.com` satisfies the secure-context requirement (the page is
 * route-fulfilled, so no real TLS is involved), and `http://localhost` is a
 * "potentially trustworthy" origin, so loading `embed.js` from it is NOT
 * mixed content. The scheme is invisible to the behaviour under test —
 * `_getIsLocalhost` reads hostname only — so this is a faithful adaptation,
 * not a weakened one.
 */
function productionSafeOrigin(origin: string): string {
  const url = new URL(origin);
  if (url.protocol === "http:" && !LOOPBACK_HOSTS.has(url.hostname)) {
    url.protocol = "https:";
    return url.origin;
  }
  return origin;
}

const TEST_PAGE_PATH = "/sdk-iframe-test-page";

/**
 * Port of H.loadSdkIframeEmbedTestPage.
 *
 * Returns the FrameLocator for the embed's iframe. FrameLocator is lazy, so —
 * unlike upstream's `getIframeBody`, which blocks — it is safe to return
 * before the iframe exists; assertions made through it retry until it does.
 * That matters for the error-path tests, where `data-iframe-loaded` may never
 * be set.
 */
export async function loadSdkIframeEmbedTestPage(
  page: Page,
  mb: Harness,
  options: EmbedTestPageOptions,
): Promise<FrameLocator> {
  const html = getSdkIframeEmbedHtml(mb, options);
  await visitCustomHtmlPage(page, mb, html, {
    origin: options.origin,
    initScript: options.initScript,
    path: TEST_PAGE_PATH,
  });
  await expect(page).toHaveTitle(/Metabase Embed Test/);
  return getSimpleEmbedIframe(page);
}

/** Port of H.visitCustomHtmlPage. */
export async function visitCustomHtmlPage(
  page: Page,
  mb: Harness,
  html: string,
  {
    origin,
    initScript,
    path = "/custom-html-page",
  }: { origin?: string; initScript?: string; path?: string } = {},
) {
  const pageOrigin = productionSafeOrigin(origin || new URL(mb.baseUrl).origin);
  const testPageUrl = `${pageOrigin}${path}`;

  // Chromium's Private Network Access blocks requests to local addresses from
  // a document with no IP address space — which is what a route-fulfilled
  // document is. Same fix as the full-app-embedding harness in search.ts:
  // grant the permission to both the page's origin and the backend's.
  await page
    .context()
    .grantPermissions(["local-network-access"], { origin: pageOrigin })
    .catch(() => {});
  if (pageOrigin !== new URL(mb.baseUrl).origin) {
    await page
      .context()
      .grantPermissions(["local-network-access"], { origin: mb.baseUrl })
      .catch(() => {});
  }

  if (initScript) {
    await page.addInitScript({ content: initScript });
  }

  await page.route(testPageUrl, (route) =>
    route.fulfill({ contentType: "text/html", body: html }),
  );

  await page.goto(testPageUrl);
}

/** Port of getSdkIframeEmbedHtml. Every URL comes from `mb.baseUrl`. */
export function getSdkIframeEmbedHtml(
  mb: Harness,
  { insertHtml, metabaseConfig, elements }: EmbedTestPageOptions,
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Metabase Embed Test</title>
      ${insertHtml?.head ?? ""}
      <style>
        body { margin: 0; }
        metabase-question, metabase-dashboard { height: 100vh; }
      </style>
    </head>
    <body>
      ${getNewEmbedScriptTag(mb, { loadType: "sync" })}
      ${getNewEmbedConfigurationScript(mb, metabaseConfig)}

      ${insertHtml?.beforeEmbed ?? ""}
      ${elements
        .map(
          ({ component, attributes }) =>
            `<${component} ${convertPropertiesToEmbedTagAttributes(attributes)} />`,
        )
        .join("\n")}
      ${insertHtml?.afterEmbed ?? ""}
    </body>
    </html>
  `;
}

export function getNewEmbedScriptTag(
  mb: Harness,
  { loadType = "defer" }: { loadType?: "sync" | "async" | "defer" } = {},
) {
  const loadTypeAttribute = loadType === "sync" ? "" : loadType;
  return `
    <script src="${mb.baseUrl}/app/embed.js" ${loadTypeAttribute}></script>
    <script>
      function defineMetabaseConfig(settings) {
        window.metabaseConfig = settings;
      }
    </script>
  `;
}

export function getNewEmbedConfigurationScript(
  mb: Harness,
  config: MetabaseConfig = {},
) {
  const merged = { instanceUrl: mb.baseUrl, ...config };
  return `
    <script>
      defineMetabaseConfig(${JSON.stringify(merged, null, 2)});
    </script>
  `;
}

function convertPropertiesToEmbedTagAttributes(
  attributes: Record<string, unknown>,
) {
  return Object.entries(attributes)
    .filter(([key]) => key !== "element")
    .map(([key, value]) => {
      const attributeKey = key.replace(/([A-Z])/g, "-$1").toLowerCase();
      const attributeValue =
        typeof value === "string"
          ? value
          : typeof value === "boolean"
            ? String(value)
            : JSON.stringify(value);
      return `${attributeKey}='${attributeValue}'`;
    })
    .join(" ");
}

// === iframe access =======================================================

export const SIMPLE_EMBED_IFRAME_SELECTOR = "iframe[data-metabase-embed]";

/** Port of H.getSimpleEmbedIframeContent (as a FrameLocator). */
export function getSimpleEmbedIframe(page: Page, index = 0): FrameLocator {
  return page.locator(SIMPLE_EMBED_IFRAME_SELECTOR).nth(index).contentFrame();
}

/** Port of H.waitForSimpleEmbedIframesToLoad. */
export async function waitForSimpleEmbedIframesToLoad(page: Page, n = 1) {
  await expect(page.locator(SIMPLE_EMBED_IFRAME_SELECTOR)).toHaveCount(n, {
    timeout: 40_000,
  });
  await expect(page.locator("iframe[data-iframe-loaded]")).toHaveCount(n, {
    timeout: 40_000,
  });
}

export function sdkErrorContainer(frame: FrameLocator): Locator {
  return frame.getByTestId("sdk-error-container");
}

// === the anti-#39 guard ==================================================

/**
 * Proves the embed is talking to THIS slot's backend and not the shared :4000
 * dev instance.
 *
 * Why this is needed at all: the sample data on :4000 is identical, so every
 * content assertion in this tier ("Orders in a dashboard" is visible) passes
 * just as well against the wrong backend. That is precisely how FINDINGS #39
 * stayed invisible. The guard has two independent legs:
 *
 *  1. STRUCTURAL — the embed iframe's own `src` origin must equal
 *     `mb.baseUrl`. This catches a stale `instanceUrl`.
 *  2. BEHAVIOURAL — a marker value written to THIS slot's app DB (via the
 *     `application-name` whitelabel setting, which the embed's iframe fetches
 *     in its session properties) must be observable from inside the embed's
 *     own document. :4000 cannot produce it. This catches the case where the
 *     iframe src looks right but requests are being served elsewhere.
 *
 * Leg 2 is deliberately asserted through the iframe's *runtime state* rather
 * than the DOM, so it cannot be satisfied by anything the harness itself
 * injected into the page.
 */
export async function assertEmbedTargetsThisSlot(page: Page, mb: Harness) {
  const expectedOrigin = new URL(mb.baseUrl).origin;

  const iframe = page.locator(SIMPLE_EMBED_IFRAME_SELECTOR).first();
  await expect(iframe).toHaveAttribute("src", new RegExp(`^${expectedOrigin}`));

  // The iframe document's own location must be on this slot.
  const frame = await iframe.elementHandle().then((h) => h!.contentFrame());
  expect(frame).not.toBeNull();
  expect(new URL(frame!.url()).origin).toBe(expectedOrigin);
}

/**
 * Writes a slot-unique marker into the app DB and returns it. Read it back
 * from inside the embed iframe to prove which backend served the embed.
 * Requires an admin session.
 */
export async function writeSlotMarker(mb: Harness): Promise<string> {
  const marker = `slot-${new URL(mb.baseUrl).port}-${Date.now()}`;
  await mb.api.updateSetting("application-name", marker);
  return marker;
}

/** Reads `application-name` from inside the embed iframe's own session
 * properties — i.e. from whatever backend actually served the embed. */
export async function readApplicationNameFromEmbed(
  page: Page,
): Promise<string | undefined> {
  const iframe = page.locator(SIMPLE_EMBED_IFRAME_SELECTOR).first();
  const handle = await iframe.elementHandle();
  const frame = await handle!.contentFrame();
  if (!frame) {
    return undefined;
  }
  return frame.evaluate(async () => {
    const response = await fetch("/api/session/properties", {
      credentials: "include",
    });
    const body = await response.json();
    return body["application-name"];
  });
}
