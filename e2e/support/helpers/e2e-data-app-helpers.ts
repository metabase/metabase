import { getIframeBody } from "./e2e-embedding-helpers";

type MockDataAppOptions = {
  /** Display name (iframe title + admin list); defaults to the fixture dir name. */
  displayName?: string;
  /** `allowed_hosts` served in the bundle response header. */
  allowedHosts?: string[];
};

/** A materialized-data-app metadata row, as `/api/data-app/:slug` returns it. */
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
 * Set up a data app for the current test without going through remote-sync/git.
 *
 * Builds the fixture `appName` (its committed `src/` layered over the
 * `create-data-app` template) with the Vite API — so the template + real build
 * are still exercised — then mocks the data-app API so the app can be listed,
 * opened, and rendered as if it had been synced:
 *
 *   GET /api/data-app                -> [app]            (admin list)
 *   GET /api/data-app/repo-status    -> { configured }   (admin page)
 *   GET /api/data-app/:slug          -> app metadata      (drives AppView)
 *   GET /api/data-app/:slug/bundle   -> the built bundle  (drives the iframe)
 *
 * The materialization + serving these stub out are covered by the backend
 * tests; this keeps the browser-only path real: build -> `/embed/data-app/:slug`
 * shell -> fetch bundle -> Near-Membrane sandbox -> host provider -> render.
 *
 * Reused across data-app cases: each case commits only its `src/`, and passes
 * its fixture dir name as `appName` (which is also the slug).
 */
export function mockDataApp(appName: string, options: MockDataAppOptions = {}) {
  const slug = appName;
  const displayName = options.displayName ?? appName;
  const allowedHosts = options.allowedHosts ?? [];

  return cy.task<string>("buildDataApp", { appName }).then((bundleCode) => {
    const app = dataAppMeta(slug, displayName, allowedHosts);

    cy.intercept("GET", "/api/data-app/repo-status", { configured: true });
    cy.intercept("GET", "/api/data-app", [app]);
    cy.intercept({ method: "GET", pathname: `/api/data-app/${slug}` }, app);
    cy.intercept(
      { method: "GET", pathname: `/api/data-app/${slug}/bundle` },
      {
        statusCode: 200,
        headers: {
          "content-type": "text/javascript",
          "X-Metabase-Data-App-Allowed-Hosts": JSON.stringify(allowedHosts),
        },
        body: bundleCode,
      },
    );

    return cy.wrap({ slug, displayName }, { log: false });
  });
}

/** Open a data app at `/data-app/:slug`. */
export function openDataApp(slug: string) {
  return cy.visit(`/data-app/${slug}`);
}

/**
 * The body of a data app's sandboxed iframe, selected by its display name (the
 * host sets the iframe `title` to the app's display name). Same-origin, so
 * Cypress can reach into it.
 */
export function dataAppIframe(displayName: string) {
  return getIframeBody(`iframe[title="${displayName}"]`);
}
