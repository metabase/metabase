import * as Urls from "metabase/urls/data-apps";
import type { DataApp } from "metabase-types/api";

import type { DataAppTestEnv } from "./data-app-test-env";
import { getIframeBody } from "./e2e-embedding-helpers";
import { LOCAL_GIT_PATH } from "./e2e-remote-sync-helpers";

export const SYNCED_DATA_APPS_FIXTURE_PATH =
  Cypress.config("projectRoot") +
  "/e2e/support/assets/example_synced_data_apps";

/**
 * Copy the example data-app repo into the working directory of the local git repo
 * `setupGitSync` created, so a `commitToRepo` + a real pull materialize its apps.
 * The repo holds one directory per materialization outcome (a good app, an app
 * whose bundle is missing, a malformed config, and a directory with no config) —
 * see the fixture and the sync spec that drives it.
 */
export const copySyncedDataAppsFixture = () =>
  cy.task("copyDirectory", {
    source: SYNCED_DATA_APPS_FIXTURE_PATH,
    destination: LOCAL_GIT_PATH,
  });

/**
 * The e2e data-app fixture that `mockDataApp` builds and serves — its directory
 * name and its `/apps/<slug>` URL segment. One bundle with a page per surface it
 * exercises (questions, query hooks, actions, clipboard, sandbox, isolation), so
 * the specs share a single build.
 */
export const DATA_APP_NAME = "kitchen-sink";
export const DATA_APP_DISPLAY_NAME = "Kitchen Sink";

/**
 * Visit a nested route inside the fixture data app. `openDataApp` encodes the
 * slug, so it can't carry a sub-path — deep-links go through a raw `cy.visit`.
 */
export const visitDataAppRoute = (route: string) =>
  cy.visit(`/apps/${DATA_APP_NAME}/${route}`);

/**
 * A minimal `DataApp`-shaped row. Admin-list state tests use it directly (they
 * only assert how the management UI renders the list, no real bundle needed);
 * `mockDataApp` uses it for the intercepted metadata of the built fixture.
 */
export const fakeDataApp = (overrides: Partial<DataApp> = {}): DataApp => ({
  id: 1,
  name: DATA_APP_NAME,
  display_name: DATA_APP_DISPLAY_NAME,
  bundle_path: `data_apps/${DATA_APP_NAME}/dist/index.js`,
  enabled: true,
  allowed_hosts: [],
  bundle_hash: "e2e-bundle-hash",
  last_synced_sha: "e2e0000",
  last_synced_at: "2024-01-01T00:00:00Z",
  sync_error: null,
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
   * Config a fixture reads at runtime, so it doesn't hard-code values that track
   * the Cypress snapshot (e.g. sample-DB ids). It's JSON-serialized and prepended
   * to the served bundle as `globalThis.__METABASE_DATA_APP_TEST_ENV__`; since the
   * bundle is evaluated as one script in the sandbox realm, the app reads it as a
   * plain global. Typed by `DataAppTestEnv` by default; pass another fixture's
   * type as `TestEnv` if it differs.
   */
  testEnv?: TestEnv;
  /**
   * Hold the bundle response for this many ms, so the app's loading window is
   * long enough to assert on. Without it a small mocked bundle can render before
   * the test ever queries, making any "still loading" assertion racy.
   */
  bundleDelay?: number;
};

/**
 * Set up a data app for the current test
 */
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
          "content-type": "text/javascript",
          "X-Metabase-Data-App-Allowed-Hosts": JSON.stringify(allowedHosts),
        },
        body: prelude + bundleCode,
        ...(options.bundleDelay ? { delay: options.bundleDelay } : {}),
      },
    );

    return cy.wrap({ slug, displayName }, { log: false });
  });
};

export function openDataApp(slug: string) {
  return cy.visit(Urls.dataApp(slug));
}

export function dataAppIframe(displayName: string) {
  return getIframeBody(`iframe[title="${displayName}"]`);
}
