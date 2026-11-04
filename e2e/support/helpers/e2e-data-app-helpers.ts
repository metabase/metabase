import { USER_GROUPS } from "e2e/support/cypress_data";
import * as Urls from "metabase/urls/data-apps";
import type { TableId } from "metabase-types/api";

import { createLibrary, publishTables } from "./api";
import { getIframeBody } from "./e2e-embedding-helpers";
import { LOCAL_GIT_PATH } from "./e2e-remote-sync-helpers";

/**
 * Builds the apps of `e2e/support/assets/data-apps` and copies that repository,
 * with the Library and the tables it publishes, into the sync repository.
 */
export const copyDataAppsFixture = () =>
  cy.task(
    "copyDataAppsFixture",
    { destination: LOCAL_GIT_PATH },
    { timeout: 300000 },
  );

/**
 * The two rejections endpoint scope enforcement can emit. `scope_not_permitted` comes from
 * `ensure-scopes-checked` — the endpoint declares no `:scope` at all, so a narrowed request
 * may not reach it. `unsupported_scope` comes from `enforce-scope` — the endpoint is scoped,
 * but not for the scope the request carries. Either one inside a data app means a route the
 * SDK really uses was never tagged `data-apps:base`.
 */
const SCOPE_ERRORS = ["scope_not_permitted", "unsupported_scope"];

let scopeDenials: string[] = [];
let scopeGuardInstalled = false;

/**
 * Records every scope rejection the backend returns while a data app is open. Every request a
 * sandboxed app makes is marked `X-Metabase-Client: data-app` and confined to `data-apps:base`,
 * so a rejection here is a route missing its `{:scope api-scope/data-app}` tag, not a
 * permission problem. `assertNoDataAppScopeDenials` (a root `afterEach`) fails the test on any.
 */
function installDataAppScopeGuard() {
  if (scopeGuardInstalled) {
    return;
  }
  scopeGuardInstalled = true;

  cy.intercept("/api/**", (req) => {
    // `after:response` rather than a `req.continue` callback: the latter buffers the body,
    // which would sit in front of the streamed `/api/dataset` responses.
    req.on("after:response", (res) => {
      // `res.body` is whatever the endpoint returned; the scope middleware answers with a
      // JSON `{error, message}` body.
      const error = (res.body as { error?: string } | undefined)?.error;
      if (
        res.statusCode === 403 &&
        error !== undefined &&
        SCOPE_ERRORS.includes(error)
      ) {
        scopeDenials.push(
          `${req.method} ${new URL(req.url).pathname} -> ${error}`,
        );
      }
    });
  });
}

/** Root `beforeEach` in `e2e/support/cypress.js`: intercepts reset between tests, so must this record. */
export function resetDataAppScopeGuard() {
  scopeDenials = [];
  scopeGuardInstalled = false;
}

/** Root `afterEach` in `e2e/support/cypress.js`. Only a test that opened a data app pays for it. */
export function assertNoDataAppScopeDenials() {
  if (!scopeGuardInstalled) {
    return;
  }
  cy.then(() => {
    expect(
      scopeDenials,
      `data-app scope rejections:\n${scopeDenials.join("\n")}`,
    ).to.deep.eq([]);
  });
}

export function openDataApp(slug: string) {
  installDataAppScopeGuard();
  return cy.visit(Urls.dataApp(slug));
}

export function dataAppIframe(displayName: string) {
  return getIframeBody(`iframe[title="${displayName}"]`);
}

const DATA_APP_DEV_HOST_APP_DIR =
  "e2e/embedding-sdk-host-apps/vite-6-data-app-host-app";

const DATA_APP_DEV_ENV_PATH = `${DATA_APP_DEV_HOST_APP_DIR}/.env.local`;

export const DATA_APP_DEV_MANIFEST_PATH = `${DATA_APP_DEV_HOST_APP_DIR}/data_app.yaml`;

export const DATA_APP_DEV_APP_SRC_PATH = `${DATA_APP_DEV_HOST_APP_DIR}/src/App.tsx`;

const DATA_APP_DEV_CONTENT_TIMEOUT_MS = 40000;

export function visitDataAppDevApp(clientHost: string) {
  cy.visit(clientHost);
  cy.findByTestId("dev-app-content", {
    timeout: DATA_APP_DEV_CONTENT_TIMEOUT_MS,
  }).should("exist");
}

type DataAppDevServerOpts = {
  clientHost: string;
  tableId: TableId;
};

export function setUpDataAppDevServer({
  clientHost,
  tableId,
}: DataAppDevServerOpts) {
  const mbUrl = Cypress.config("baseUrl");
  if (!mbUrl) {
    throw new Error("baseUrl must be set for the data-app dev-server suite");
  }

  createLibrary();
  publishTables({ table_ids: [tableId] });
  cy.task("removeDataAppPaths", { paths: [DATA_APP_DEV_ENV_PATH] });
  waitForDataAppDevServerEnv(clientHost, mbUrl, { expectPresent: false });

  cy.request("POST", "/api/api-key", {
    name: `data-app-dev-e2e-${Date.now()}`,
    group_id: USER_GROUPS.ADMIN_GROUP,
  }).then(({ body }) => {
    cy.task("writeDataAppFiles", {
      files: {
        [DATA_APP_DEV_ENV_PATH]: `DATA_APP_MB_URL=${mbUrl}\nDATA_APP_MB_API_KEY=${body.unmasked_key}\n`,
      },
    });
  });

  waitForDataAppDevServerEnv(clientHost, mbUrl, { expectPresent: true });
}

export function tearDownDataAppDevServer() {
  return cy.task("removeDataAppPaths", { paths: [DATA_APP_DEV_ENV_PATH] });
}

// `DATA_APP_MB_URL` shows up in (or drops out of) the served CSP once Vite has
// restarted onto the changed env — poll for the expected state before visiting.
function waitForDataAppDevServerEnv(
  clientHost: string,
  mbUrl: string,
  { expectPresent }: { expectPresent: boolean },
  attempt = 0,
) {
  const MAX_ATTEMPTS = 40;
  const origin = new URL(mbUrl).origin;

  cy.request({
    url: `${clientHost}/`,
    headers: { Accept: "text/html" },
    failOnStatusCode: false,
  }).then((res) => {
    const csp = String(res.headers["content-security-policy"] ?? "");

    if (csp.includes(origin) === expectPresent) {
      return;
    }

    if (attempt >= MAX_ATTEMPTS) {
      throw new Error(
        `Dev server never restarted onto DATA_APP_MB_URL ${expectPresent ? "present" : "absent"} (${origin}); last CSP: "${csp}"`,
      );
    }

    cy.wait(1000);
    waitForDataAppDevServerEnv(
      clientHost,
      mbUrl,
      { expectPresent },
      attempt + 1,
    );
  });
}
