import type { DataAppTestEnv } from "e2e/support/assets/data-apps/renders-interactive-question/src/test-env";
import * as Urls from "metabase/urls/data-apps";

import { getIframeBody } from "./e2e-embedding-helpers";

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
   * plain global. Typed by the fixture's `test-env.ts` (`DataAppTestEnv` by
   * default); pass another fixture's type as `TestEnv` if it differs.
   */
  testEnv?: TestEnv;
};

function dataAppMeta(
  slug: string,
  displayName: string,
  allowedHosts: string[],
) {
  return {
    id: 1,
    name: slug,
    display_name: displayName,
    bundle_path: `data_apps/${slug}/dist/index.js`,
    enabled: true,
    allowed_hosts: allowedHosts,
    bundle_hash: "e2e-bundle-hash",
    last_synced_sha: "e2e0000",
    last_synced_at: "2024-01-01T00:00:00Z",
    sync_error: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  };
}

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
    const app = dataAppMeta(slug, displayName, allowedHosts);

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
