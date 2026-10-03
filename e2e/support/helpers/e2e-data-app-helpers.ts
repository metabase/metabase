import { USER_GROUPS } from "e2e/support/cypress_data";
import * as Urls from "metabase/urls/data-apps";
import type {
  CardId,
  Collection,
  CollectionId,
  CollectionPermission,
  CollectionPermissionsGraph,
  DataApp,
} from "metabase-types/api";

import type { DataAppTestEnv } from "./data-app-test-env";
import { getIframeBody } from "./e2e-embedding-helpers";
import {
  LOCAL_GIT_PATH,
  commitToRepo,
  configureGitAndPullChanges,
  copySyncedCollectionFixture,
  setupGitSync,
} from "./e2e-remote-sync-helpers";

export const DATA_APP_NAME = "kitchen-sink";
export const DATA_APP_DISPLAY_NAME = "Kitchen Sink";

export const visitDataAppRoute = (route: string) => {
  installDataAppScopeGuard();
  return cy.visit(`/apps/${DATA_APP_NAME}/${route}`);
};

export const fakeDataApp = (overrides: Partial<DataApp> = {}): DataApp => ({
  id: 1,
  entity_id: "e2eFakeDataAppEntityI",
  name: DATA_APP_NAME,
  display_name: DATA_APP_DISPLAY_NAME,
  description: null,
  version: 1,
  outdated: false,
  bundle_path: "dist/index.js",
  enabled: true,
  draft: false,
  resource_collection_id: null,
  permission_group_id: null,
  table_ids: [],
  allowed_hosts: [],
  bundle_hash: "e2e-bundle-hash",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  ...overrides,
});

type MockDataAppOptions<TestEnv> = {
  /** Display name (iframe title + admin list); defaults to the fixture dir name. */
  displayName?: string;
  /** `allowed_hosts` served in the bundle response header. */
  allowedHosts?: string[];
  /**
   * Config a fixture reads at runtime, rather than hard-coding ids that track the
   * Cypress snapshot.
   */
  testEnv?: TestEnv;
  /** Delays the bundle response, so a loading assertion has a window to catch. */
  bundleDelayMs?: number;
};

export const mockDataApp = <TestEnv = DataAppTestEnv>(
  appName: string,
  options: MockDataAppOptions<TestEnv> = {},
) => {
  const slug = appName;
  const displayName = options.displayName ?? appName;
  const allowedHosts = options.allowedHosts ?? [];

  // Prelude runs in the sandbox realm before the bundle's factory, so the app
  // can read the injected config as a global (see MockDataAppOptions.testEnv).
  const prelude =
    options.testEnv !== undefined
      ? `globalThis.__METABASE_DATA_APP_TEST_ENV__ = ${JSON.stringify(options.testEnv)};\n`
      : "";

  return cy.task<string>("buildDataApp", { appName }).then((bundleCode) => {
    const app = fakeDataApp({
      name: slug,
      display_name: displayName,
      allowed_hosts: allowedHosts,
    });

    cy.intercept("GET", "/api/apps/repo-status", {
      configured: true,
    });
    cy.intercept("GET", "/api/apps", [app]);
    cy.intercept({ method: "GET", pathname: `/api/apps/${slug}` }, app);
    cy.intercept(
      { method: "GET", pathname: `/api/apps/${slug}/bundle` },
      {
        statusCode: 200,
        headers: {
          // Match the REAL bundle endpoint (`data_apps/api.clj`), which serves
          // `application/javascript` + `nosniff`. The runtime fetch-and-evals the
          // bundle, so the type is irrelevant there — but a stricter mock (e.g.
          // `text/plain`) would diverge from production, so keep it aligned.
          "content-type": "application/javascript",
          "X-Content-Type-Options": "nosniff",
          "X-Metabase-Data-App-Allowed-Hosts": JSON.stringify(allowedHosts),
        },
        body: prelude + bundleCode,
        ...(options.bundleDelayMs ? { delay: options.bundleDelayMs } : {}),
      },
    );

    return cy.wrap({ slug, displayName }, { log: false });
  });
};

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
    ).to.be.empty;
  });
}

export function openDataApp(slug: string) {
  installDataAppScopeGuard();
  return cy.visit(Urls.dataApp(slug));
}

export function dataAppIframe(displayName: string) {
  return getIframeBody(`iframe[title="${displayName}"]`);
}

export function setDataAppCollectionAccess(
  collectionId: CollectionId,
  access: CollectionPermission,
) {
  return cy
    .request<CollectionPermissionsGraph>("GET", "/api/collection/graph")
    .then(({ body: graph }) => {
      const groups = Object.fromEntries(
        Object.entries(graph.groups).map(([groupId, collections]) => [
          groupId,
          Number(groupId) === USER_GROUPS.ADMIN_GROUP
            ? collections
            : { ...collections, [collectionId]: access },
        ]),
      );

      cy.request("PUT", "/api/collection/graph", { ...graph, groups });
    });
}

export function moveDataAppModelToCollection({
  modelId,
  name,
  access,
}: {
  modelId: CardId;
  name: string;
  access: CollectionPermission;
}) {
  return cy
    .request<Collection>("POST", "/api/collection", { name })
    .then(({ body: collection }) => {
      cy.request("PUT", `/api/card/${modelId}`, {
        collection_id: collection.id,
      });

      setDataAppCollectionAccess(collection.id, access);

      return cy.wrap(collection, { log: false });
    });
}

export const copySyncedDataAppsFixture = () =>
  cy.task("copyDirectory", {
    source: `${Cypress.config("projectRoot")}/e2e/support/assets/example_synced_data_apps`,
    destination: LOCAL_GIT_PATH,
  });

/**
 * Pulls `example_synced_data_apps` through a real remote-sync import, so a spec
 * gets real app rows, each with its resource collection and permission group.
 * `good` is served; `broken-bundle` fails to sync.
 */
export function pullExampleDataApps() {
  setupGitSync();
  copySyncedCollectionFixture();
  copySyncedDataAppsFixture();
  commitToRepo("Add data apps");
  configureGitAndPullChanges("read-write");
}

/** Puts a user in the app's own permission group, as granting app access does. */
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

export function setUpDataAppDevServer(clientHost: string) {
  const mbUrl = Cypress.config("baseUrl");
  if (!mbUrl) {
    throw new Error("baseUrl must be set for the data-app dev-server suite");
  }

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
