/**
 * Data-apps domain helpers — port of e2e/support/helpers/e2e-data-app-helpers.ts
 * plus the co-located test-env from e2e/test/scenarios/data-apps/helpers/index.ts.
 *
 * `mockDataApp` fully intercepts the `/api/apps/*` surface (repo-status, list,
 * metadata, and the JS bundle) so the tests exercise the FE host route
 * (`/apps/:slug`), the BE iframe entrypoint (`/embed/apps/:slug`) and the SDK
 * data-app runtime/sandbox — not the (unported) data-apps REST API. The bundle
 * is the real built fixture; `buildDataAppBundle` runs the same Vite build the
 * Cypress `buildDataApp` task runs, and caches the result per process.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import type { FrameLocator, Page } from "@playwright/test";

import type { RemoteSyncRepo } from "./remote-sync";
import { SAMPLE_DATABASE } from "./sample-data";

const REPO_ROOT = path.resolve(__dirname, "../..");
const DATA_APP_FIXTURES_DIR = path.join(
  REPO_ROOT,
  "e2e/support/assets/data-apps",
);
const DATA_APP_BUILD_SCRIPT = path.join(
  REPO_ROOT,
  "e2e/support/helpers/build-data-app-fixture.mjs",
);
const SYNCED_DATA_APPS_FIXTURE_PATH = path.join(
  REPO_ROOT,
  "e2e/support/assets/example_synced_data_apps",
);

/** The fixture data app `mockDataApp` builds and serves — dir name + URL slug. */
export const DATA_APP_NAME = "kitchen-sink";
export const DATA_APP_DISPLAY_NAME = "Kitchen Sink";

const { ORDERS_ID } = SAMPLE_DATABASE;

type TableSource = { type: "table"; id: number };

/**
 * The config a spec injects into the fixture (via `mockDataApp`'s `testEnv`).
 * Structural port of `DataAppTestEnv` — kept local so the Playwright TS program
 * doesn't have to pull the Cypress support bundle (and its SDK type imports).
 */
export type DataAppTestEnv = {
  scalarQuery: {
    source: TableSource;
    aggregations: { type: "operator"; operator: "count"; args: [] }[];
  };
  questionQuery: { source: TableSource };
  sandbox?: {
    allowedUrl: string;
    blockedUrl: string;
    xhrAllowedUrl?: string;
    xhrBlockedUrl?: string;
  };
  /** `/actions` page: id of the action `useAction` executes (spec-created). */
  actionId?: number;
  /** `/actions` page: the parameters the page passes to `execute()`. */
  actionParams?: Record<string, string | number>;
};

const source: TableSource = { type: "table", id: ORDERS_ID };

/** The `testEnv` the fixture's Overview page reads (Orders count + question). */
export const DATA_APP_TEST_ENV: DataAppTestEnv = {
  scalarQuery: {
    source,
    aggregations: [{ type: "operator", operator: "count", args: [] }],
  },
  questionQuery: { source },
};

/** A minimal `DataApp`-shaped row for the intercepted metadata endpoints. */
const fakeDataApp = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  name: DATA_APP_NAME,
  display_name: DATA_APP_DISPLAY_NAME,
  bundle_path: `data_apps/${DATA_APP_NAME}/dist/index.js`,
  enabled: true,
  allowed_hosts: [] as string[],
  bundle_hash: "e2e-bundle-hash",
  last_synced_sha: "e2e0000",
  last_synced_at: "2024-01-01T00:00:00Z",
  sync_error: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  ...overrides,
});

// One build per process (the fixture bundle is identical across every test).
const bundleCache = new Map<string, Promise<string>>();

/**
 * Port of the Cypress `buildDataApp` task: run the Vite build for a fixture and
 * return its bundle code. Cached per process so the ~seconds-long build runs at
 * most once.
 */
export function buildDataAppBundle(
  appName: string = DATA_APP_NAME,
): Promise<string> {
  const cached = bundleCache.get(appName);
  if (cached) {
    return cached;
  }

  const built = new Promise<string>((resolve, reject) => {
    const appDir = path.join(DATA_APP_FIXTURES_DIR, appName);
    if (!fs.existsSync(path.join(appDir, "src"))) {
      reject(
        new Error(`data-app fixture "${appName}" has no src/ at ${appDir}`),
      );
      return;
    }

    const child = spawn(
      process.execPath,
      [DATA_APP_BUILD_SCRIPT, appName],
      { cwd: REPO_ROOT, stdio: ["ignore", "inherit", "inherit"] },
    );
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== 0) {
        reject(
          new Error(`data-app build for "${appName}" exited with code ${code}`),
        );
        return;
      }
      const bundlePath = path.join(appDir, "dist/index.js");
      if (!fs.existsSync(bundlePath)) {
        reject(
          new Error(
            `data-app build for "${appName}" produced no bundle at ${bundlePath}`,
          ),
        );
        return;
      }
      resolve(fs.readFileSync(bundlePath, "utf8"));
    });
  });

  bundleCache.set(appName, built);
  return built;
}

export type MockDataAppOptions = {
  /** Display name (iframe title); defaults to the fixture dir name. */
  displayName?: string;
  /** `allowed_hosts` served in the bundle response header. */
  allowedHosts?: string[];
  /** Config the fixture reads at runtime as `__METABASE_DATA_APP_TEST_ENV__`. */
  testEnv?: DataAppTestEnv;
  /** Hold the bundle response this many ms, to widen the loading window. */
  bundleDelay?: number;
};

/**
 * Port of `H.mockDataApp`: build the fixture bundle and route the `/api/apps/*`
 * endpoints to serve it. Everything else under `/api/apps` (e.g. the SDK's real
 * query calls) continues to the backend, mirroring the Cypress intercepts,
 * which only stub these four paths.
 */
export async function mockDataApp(
  page: Page,
  appName: string,
  options: MockDataAppOptions = {},
) {
  const slug = appName;
  const displayName = options.displayName ?? appName;
  const allowedHosts = options.allowedHosts ?? [];

  const bundleCode = await buildDataAppBundle(appName);
  const prelude =
    options.testEnv !== undefined
      ? `globalThis.__METABASE_DATA_APP_TEST_ENV__ = ${JSON.stringify(options.testEnv)};\n`
      : "";

  const app = fakeDataApp({
    name: slug,
    display_name: displayName,
    allowed_hosts: allowedHosts,
  });

  await page.route(
    (url) => url.pathname.startsWith("/api/apps"),
    async (route) => {
      const request = route.request();
      if (request.method() !== "GET") {
        await route.continue();
        return;
      }
      const { pathname } = new URL(request.url());

      if (pathname === "/api/apps/repo-status") {
        await route.fulfill({ json: { configured: true } });
        return;
      }
      if (pathname === "/api/apps") {
        await route.fulfill({ json: [app] });
        return;
      }
      if (pathname === `/api/apps/${slug}`) {
        await route.fulfill({ json: app });
        return;
      }
      if (pathname === `/api/apps/${slug}/bundle`) {
        if (options.bundleDelay) {
          await new Promise((resolve) =>
            setTimeout(resolve, options.bundleDelay),
          );
        }
        await route.fulfill({
          status: 200,
          headers: {
            "content-type": "text/javascript",
            "X-Metabase-Data-App-Allowed-Hosts": JSON.stringify(allowedHosts),
          },
          body: prelude + bundleCode,
        });
        return;
      }

      await route.continue();
    },
  );

  return { slug, displayName };
}

/** Port of `H.openDataApp`: visit the host page route `/apps/:slug`. */
export function openDataApp(page: Page, baseUrl: string, slug: string) {
  return page.goto(`${baseUrl}/apps/${encodeURIComponent(slug)}`);
}

/** Port of `visitDataAppRoute`: deep-link a nested route inside the fixture. */
export function visitDataAppRoute(page: Page, baseUrl: string, route: string) {
  return page.goto(`${baseUrl}/apps/${DATA_APP_NAME}/${route}`);
}

/** Port of `H.dataAppIframe`: the FrameLocator for the app's embed iframe. */
export function dataAppIframe(page: Page, displayName: string): FrameLocator {
  return page.frameLocator(`iframe[title="${displayName}"]`);
}

/**
 * Port of `H.copySyncedDataAppsFixture` (cy.task copyDirectory → fs.cpSync):
 * copy the example data-app repo (one dir per materialization outcome, with
 * PREBUILT bundles — no build step) into the remote-sync repo, so a commit +
 * pull materializes its apps. Mirrors support/remote-sync.ts's
 * copySyncedCollectionFixture; takes the same RemoteSyncRepo the git helpers
 * create.
 */
export function copySyncedDataAppsFixture(repo: RemoteSyncRepo): void {
  fs.cpSync(SYNCED_DATA_APPS_FIXTURE_PATH, repo.path, { recursive: true });
}
