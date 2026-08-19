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
import { LOCAL_GIT_PATH } from "./e2e-remote-sync-helpers";

export const DATA_APP_NAME = "kitchen-sink";
export const DATA_APP_DISPLAY_NAME = "Kitchen Sink";

export const visitDataAppRoute = (route: string) =>
  cy.visit(`/apps/${DATA_APP_NAME}/${route}`);

export const fakeDataApp = (overrides: Partial<DataApp> = {}): DataApp => ({
  id: 1,
  name: DATA_APP_NAME,
  display_name: DATA_APP_DISPLAY_NAME,
  description: null,
  bundle_path: `data_apps/${DATA_APP_NAME}/dist/index.js`,
  enabled: true,
  resource_collection_id: null,
  permission_group_id: null,
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

export function openDataApp(slug: string) {
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

/**
 * The dev host app is a real vite data app with the published SDK installed, so
 * synchronizing it exercises the package an author actually consumes rather than
 * the stub the scratch fixture provides.
 */
export const dataAppHostAppRoot = () =>
  `${Cypress.config("projectRoot")}/${DATA_APP_DEV_HOST_APP_DIR}`;

const actionDeclarationsFile = (appRoot: string) =>
  `${appRoot}/actions/orders.action.ts`;

/**
 * Clears everything synchronization generates in the host app. Both sync specs
 * drive the same checked-in directory, so each has to start from a clean tree —
 * a stray `actions/` would otherwise be discovered by the query spec's sync.
 */
export function resetDataAppHostAppSources() {
  const appRoot = dataAppHostAppRoot();

  return cy.task("removeDataAppPaths", {
    paths: [
      `${appRoot}/queries`,
      `${appRoot}/actions`,
      `${appRoot}/resources_metadata.json`,
    ],
  });
}

export function declareDataAppActions(
  appRoot: string,
  sourceActionIds: number[],
) {
  return cy.task("writeDataAppFiles", {
    files: {
      [actionDeclarationsFile(appRoot)]: [
        'import { defineAction } from "@metabase/embedding-sdk-react/data-app";',
        ...sourceActionIds.map(
          (id) =>
            `export const Action${id} = defineAction({ action: { id: ${id}, parameters: [] } });`,
        ),
      ].join("\n"),
    },
  });
}

const queryDeclarationsFile = (appRoot: string) =>
  `${appRoot}/queries/orders.query.ts`;

/** Declares one `defineQuery` per entry, as an app author would. */
export function declareDataAppQueries(
  appRoot: string,
  declarations: Array<{ name: string; tableId: number; limit?: number }>,
) {
  return cy.task("writeDataAppFiles", {
    files: {
      [queryDeclarationsFile(appRoot)]: [
        'import { defineQuery } from "@metabase/embedding-sdk-react/data-app";',
        ...declarations.map(({ name, tableId, limit }) => {
          const clauses = limit === undefined ? "" : `, limit: ${limit}`;
          return `export const ${name} = defineQuery({ source: { type: "table", id: ${tableId} }${clauses} });`;
        }),
      ].join("\n"),
    },
  });
}

/**
 * Deletes one declaration in place, so the rest keep the generated IDs
 * synchronization injected — which is what an author removing one does.
 * Splits on the declaration keyword rather than on lines, because an injected
 * ID lands on its own line and makes a declaration span several.
 */
function removeDeclaration(filePath: string, exportName: string) {
  return cy.task("removeDataAppDeclaration", { filePath, exportName });
}

export function removeDataAppQueryDeclaration(appRoot: string, name: string) {
  return removeDeclaration(queryDeclarationsFile(appRoot), name);
}

export function removeDataAppActionDeclaration(
  appRoot: string,
  sourceActionId: number,
) {
  return removeDeclaration(
    actionDeclarationsFile(appRoot),
    `Action${sourceActionId}`,
  );
}

/** Runs the real `sync-resources` CLI against the instance under test. */
export function syncDataAppResources(apiKey: string, appRoot: string) {
  return cy.task<{ ok: boolean; error: string | null }>("syncDataApp", {
    appRoot,
    metabaseUrl: Cypress.config("baseUrl"),
    apiKey,
  });
}

const SYNCED_DATA_APP_SLUGS = ["good", "broken-bundle"];

export const copySyncedDataAppsFixture = () =>
  cy.task("copyDirectory", {
    source: `${Cypress.config("projectRoot")}/e2e/support/assets/example_synced_data_apps`,
    destination: LOCAL_GIT_PATH,
  });

/** The test repo is not an npm project, so `defineQuery` needs a stub to resolve. */
export function declareSyncedDataAppQuery(slug: string, tableId: number) {
  const appRoot = `${LOCAL_GIT_PATH}/data_apps/${slug}`;
  const packageRoot = `${appRoot}/node_modules/@metabase/embedding-sdk-react`;

  return cy.task("writeDataAppFiles", {
    files: {
      [`${packageRoot}/package.json`]: JSON.stringify({
        name: "@metabase/embedding-sdk-react",
        exports: { "./data-app": "./data-app.js" },
      }),
      [`${packageRoot}/data-app.js`]: "exports.defineQuery = (q) => q;",
      [`${appRoot}/queries/orders.query.ts`]: [
        'import { defineQuery } from "@metabase/embedding-sdk-react/data-app";',
        `export const Orders = defineQuery({ source: { type: "table", id: ${tableId} } });`,
        "",
      ].join("\n"),
    },
  });
}

/** Provisions each fixture app the way an author does, so its manifest carries the entity IDs the repo sync resolves. */
export const provisionSyncedDataAppResources = () =>
  createDataAppApiKey().then((apiKey) =>
    cy.wrap<string[]>(SYNCED_DATA_APP_SLUGS).each((slug: string) =>
      syncDataAppResources(apiKey, `${LOCAL_GIT_PATH}/data_apps/${slug}`).then(
        ({ ok, error }) => {
          expect(error, `sync-resources failed for ${slug}`).to.eq(null);
          expect(ok).to.eq(true);
        },
      ),
    ),
  );

export function createDataAppApiKey() {
  return cy
    .request<{ unmasked_key: string }>("POST", "/api/api-key", {
      name: `data-app-sync-e2e-${Date.now()}`,
      group_id: USER_GROUPS.ADMIN_GROUP,
    })
    .then(({ body }) => body.unmasked_key);
}

/**
 * A second app beside the host app, for cases that need two of them. It reuses
 * the host app's `node_modules`, so `defineQuery` still resolves through the
 * published SDK, and its directory name becomes the app's slug.
 */
export function createSecondDataApp(slug: string) {
  cy.task("scaffoldDataApp", { appName: slug, sdkFrom: dataAppHostAppRoot() });

  return `${Cypress.config("projectRoot")}/e2e/tmp/${slug}`;
}

/**
 * Runs the host app's own production build. The SDK's `metabase-resource-sync-check`
 * plugin runs on `buildStart`, so this is what refuses to bundle a stale app.
 */
export function buildDataAppHostApp() {
  return cy.exec(`cd "${dataAppHostAppRoot()}" && npm run build`, {
    failOnNonZeroExit: false,
    timeout: 180_000,
  });
}

/** The app's own permission group — the one its viewers are given. */
export function dataAppPermissionGroupId(slug: string) {
  return cy.request<DataApp>(`/api/apps/${slug}`).then(({ body }) => {
    const groupId = body.permission_group_id;

    if (typeof groupId !== "number") {
      throw new Error(`Data app ${slug} has no permission group.`);
    }

    return cy.wrap(groupId, { log: false });
  });
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
