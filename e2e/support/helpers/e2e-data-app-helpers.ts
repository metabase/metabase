import { nanoid } from "@reduxjs/toolkit";
import yaml from "js-yaml";

import { USERS, USER_GROUPS, WRITABLE_DB_ID } from "e2e/support/cypress_data";
import * as Urls from "metabase/urls/data-apps";
import { NANOID_LENGTH } from "metabase-types/api";
import type {
  Collection,
  CollectionId,
  CollectionPermission,
  CollectionPermissionsGraph,
  DataApp,
  Group,
  RemoteSyncTask,
  WritebackAction,
  GroupInfo,
} from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import { createApiKey, createTestNativeQuery } from "./api";
import type { DataAppTestEnv } from "./data-app-test-env";
import { getIframeBody } from "./e2e-embedding-helpers";
import {
  LOCAL_GIT_PATH,
  commitToRepo,
  configureGit,
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
  resource_collection_id: 1,
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

/**
 * Sets every non-admin group's access to a collection through the permission graph of
 * the collection's namespace: an app's own collection lives in `data-apps`, whose graph
 * is separate from the default one. A namespace graph lists only the groups holding a
 * grant in it, so the groups come from the groups API, not from the graph.
 */
export function setDataAppCollectionAccess(
  collectionId: CollectionId,
  access: CollectionPermission,
) {
  return cy
    .request<Collection>("GET", `/api/collection/${collectionId}`)
    .then(({ body: collection }) => {
      const namespace = collection.namespace ?? undefined;
      const graphUrl =
        namespace === undefined
          ? "/api/collection/graph"
          : `/api/collection/graph?namespace=${namespace}`;

      cy.request<Group[]>("GET", "/api/permissions/group").then(
        ({ body: allGroups }) => {
          cy.request<CollectionPermissionsGraph>("GET", graphUrl).then(
            ({ body: graph }) => {
              const groups = Object.fromEntries(
                allGroups
                  .filter((group) => group.id !== USER_GROUPS.ADMIN_GROUP)
                  .map((group) => [
                    group.id,
                    { ...graph.groups[group.id], [collectionId]: access },
                  ]),
              );

              cy.request("PUT", "/api/collection/graph", {
                ...graph,
                ...(namespace === undefined ? {} : { namespace }),
                groups,
              });
            },
          );
        },
      );
    });
}

/** Creates a data actions folder the non-admin groups hold `access` to. */
export function createDataAppCollection({
  name,
  access,
}: {
  name: string;
  access: CollectionPermission;
}) {
  return cy
    .request<Collection>("POST", "/api/collection", {
      name,
      namespace: "data-actions",
    })
    .then(({ body: collection }) => {
      setDataAppCollectionAccess(collection.id, access);
      return cy.wrap(collection, { log: false });
    });
}

/** Creates a query action without a model that inserts a team into `scoreboard_actions`. */
export function createDataAppScoreboardAction({
  name = "Add team",
  collectionId = null,
}: { name?: string; collectionId?: CollectionId | null } = {}) {
  return createTestNativeQuery({
    database: WRITABLE_DB_ID,
    query:
      "INSERT INTO scoreboard_actions (team_name, score) VALUES ({{team_name}}, {{score}})",
    templateTags: {
      team_name: { type: "text", "display-name": "Team name", required: true },
      score: { type: "number", "display-name": "Score", required: true },
    },
  }).then((datasetQuery) =>
    cy
      .request<WritebackAction>("POST", "/api/action", {
        name,
        type: "query",
        database_id: WRITABLE_DB_ID,
        collection_id: collectionId,
        dataset_query: datasetQuery,
        parameters: [
          {
            id: "team_name",
            slug: "team_name",
            name: "Team name",
            type: "string/=",
            target: ["variable", ["template-tag", "team_name"]],
            required: true,
          },
          {
            id: "score",
            slug: "score",
            name: "Score",
            type: "number/=",
            target: ["variable", ["template-tag", "score"]],
            required: true,
          },
        ],
      })
      .then(({ body: action }) => cy.wrap(action, { log: false })),
  );
}

/**
 * The dev host app is a real vite data app with the published SDK installed, so
 * its CLI and build are the ones an author actually runs.
 */
export const dataAppHostAppRoot = () =>
  `${Cypress.config("projectRoot")}/${DATA_APP_DEV_HOST_APP_DIR}`;

/**
 * Clears what the resource specs write into the host app. They drive the same
 * checked-in directory, so each has to start from a clean tree.
 */
export function resetDataAppHostAppSources() {
  const appRoot = dataAppHostAppRoot();

  return cy.task("removeDataAppPaths", {
    paths: [
      `${appRoot}/queries`,
      `${appRoot}/actions`,
      `${appRoot}/collections`,
    ],
  });
}

/** A new entity ID, as `representations generate-entity-id` makes one for an author. */
export const newEntityId = () => nanoid(NANOID_LENGTH);

/**
 * A table as serialized YAML references it: database, schema, and table name.
 * The schema is null for a database without schemas.
 */
export type PortableTable = [
  database: string,
  schema: string | null,
  table: string,
];

type ResourceEntity = Record<string, unknown>;

/** The slug serialization labels an entity with, from its name: lowercase, every other character an underscore. */
const slugOf = (name: string) =>
  name.toLowerCase().replace(/[^\p{L}\p{N}_.]/gu, "_");

const serdesMeta = (model: string, entityId: string, name: string) => [
  { id: entityId, label: slugOf(name), model },
];

/** The app's collection: a root collection of the `data-apps` namespace. */
const resourceCollection = (
  entityId: string,
  name: string,
): ResourceEntity => ({
  name,
  namespace: "data-apps",
  entity_id: entityId,
  "serdes/meta": serdesMeta("Collection", entityId, name),
});

/**
 * A card in the app's collection, as an author writes it: a saved question from a
 * query definition, or a copy of a metric from the repository. `stage`
 * holds the clauses besides the source table.
 */
const resourceCard = ({
  entityId,
  name,
  type,
  collection,
  table,
  stage = {},
}: {
  entityId: string;
  name: string;
  type: "question" | "metric";
  collection: string;
  table: PortableTable;
  stage?: ResourceEntity;
}): ResourceEntity => ({
  name,
  type,
  display: type === "metric" ? "scalar" : "table",
  entity_id: entityId,
  collection_id: collection,
  creator_id: USERS.admin.email,
  dataset_query: {
    "lib/type": "mbql/query",
    database: table[0],
    stages: [
      { "lib/type": "mbql.stage/mbql", "source-table": table, ...stage },
    ],
  },
  visualization_settings: {},
  "serdes/meta": serdesMeta("Card", entityId, name),
});

/**
 * The copies of the actions `copies` name, as an author writes them into the
 * app's collection: what Metabase serializes for each source action, with the
 * copy's entity ID and in the app's `collection`.
 */
export function serializeDataAppActionCopies(
  copies: Array<{ sourceActionId: number; entityId: string }>,
  collection: string,
) {
  return cy
    .request<{ actions: Array<{ entity: ResourceEntity }> }>(
      "POST",
      "/api/apps/serialize-resources",
      {
        collection,
        actions: copies.map(({ sourceActionId }) => sourceActionId),
      },
    )
    .then(({ body }) =>
      cy.wrap(
        copies.map(({ entityId }, index): ResourceEntity => {
          const { entity } = body.actions[index];

          return {
            ...entity,
            entity_id: entityId,
            collection_id: collection,
            "serdes/meta": serdesMeta("Action", entityId, String(entity.name)),
          };
        }),
        { log: false },
      ),
    );
}

/**
 * The YAML an author writes for an app's collection, in the Metabase
 * representation format: plain data for `writeDataAppResources`, read from
 * nothing and written nowhere by itself.
 */
export const dataAppRepresentations = {
  collection: resourceCollection,
  card: resourceCard,
};

const fileName = (entity: ResourceEntity) =>
  `${slugOf(String(entity.name))}_${String(entity.entity_id)}.yaml`;

/**
 * Writes the files of an app's collection as YAML under `collections/data_apps/`
 * of `root`, as serialization lays them out: the collection's own file beside
 * a directory of its name that holds the cards and actions. `root` is the
 * repository the app lives in, or the app itself when it stands alone, as the
 * CLI reads them. Replaces what was there for that collection.
 */
export function writeDataAppResources(
  root: string,
  {
    collection,
    cards = [],
    actions = [],
  }: {
    collection: ResourceEntity;
    cards?: ResourceEntity[];
    actions?: ResourceEntity[];
  },
) {
  const collectionsDir = `${root}/collections/data_apps`;
  const stem = slugOf(String(collection.name));
  const collectionDir = `${collectionsDir}/${stem}`;

  cy.task("removeDataAppPaths", {
    paths: [`${collectionsDir}/${stem}.yaml`, collectionDir],
  });

  return cy.task("writeDataAppFiles", {
    files: {
      [`${collectionsDir}/${stem}.yaml`]: yaml.dump(collection),
      ...Object.fromEntries(
        [...cards, ...actions].map((entity) => [
          `${collectionDir}/${fileName(entity)}`,
          yaml.dump(entity),
        ]),
      ),
    },
  });
}

/** Declares one `defineAction` per action, as the generated schema names it, with the ID of its copy. */
export function declareDataAppActions(
  appRoot: string,
  actions: Array<{
    exportName: string;
    sourceActionId: number;
    copiedActionEntityId: string;
  }>,
) {
  return cy.task("writeDataAppFiles", {
    files: {
      [`${appRoot}/actions/orders.action.ts`]: [
        'import { defineAction } from "@metabase/embedding-sdk-react/data-app";',
        ...actions.map(
          ({ exportName, sourceActionId, copiedActionEntityId }) =>
            `export const ${exportName} = defineAction({ copiedActionEntityId: "${copiedActionEntityId}", action: { id: ${sourceActionId}, parameters: [] } });`,
        ),
      ].join("\n"),
    },
  });
}

/** Declares one `defineQuery` per entry, as an app author would, with the ID of its saved question. */
export function declareDataAppQueries(
  appRoot: string,
  declarations: Array<{
    name: string;
    tableId: number;
    savedQuestionEntityId: string;
    metricId?: number;
  }>,
) {
  return cy.task("writeDataAppFiles", {
    files: {
      [`${appRoot}/queries/orders.query.ts`]: [
        'import { defineQuery } from "@metabase/embedding-sdk-react/data-app";',
        ...declarations.map(
          ({ name, tableId, savedQuestionEntityId, metricId }) => {
            const clauses =
              metricId === undefined
                ? ""
                : `, aggregations: [{ type: "metric", id: ${metricId} }]`;
            return `export const ${name} = defineQuery({ savedQuestionEntityId: "${savedQuestionEntityId}", source: { type: "table", id: ${tableId} }${clauses} });`;
          },
        ),
      ].join("\n"),
    },
  });
}

/**
 * Runs the data app CLI the host app has installed, the one an author runs:
 * `embedding-sdk-react data-apps <command>`. `check-resources` never calls Metabase; `print-resources`
 * reaches it through `env` (see `dataAppCliEnv`).
 */
export function runDataAppCli(command: string, env?: Record<string, string>) {
  return cy.exec(
    `cd "${dataAppHostAppRoot()}" && ./node_modules/.bin/embedding-sdk-react data-apps ${command}`,
    { failOnNonZeroExit: false, timeout: 60_000, env },
  );
}

/**
 * The instance and an admin API key a data-app command reaches Metabase with,
 * as the environment variables `.env.local` would otherwise hold.
 */
export function dataAppCliEnv() {
  return createApiKey(
    `data-app-cli-e2e-${Date.now()}`,
    USER_GROUPS.ADMIN_GROUP,
  ).then(({ body }) => ({
    DATA_APP_MB_URL: String(Cypress.config("baseUrl")),
    DATA_APP_MB_API_KEY: body.unmasked_key,
  }));
}

export const copySyncedDataAppsFixture = () =>
  cy.task("copyDirectory", {
    source: `${Cypress.config("projectRoot")}/e2e/support/assets/example_synced_data_apps`,
    destination: LOCAL_GIT_PATH,
  });

/**
 * Pulls `example_synced_data_apps` through a real remote-sync import, so a spec
 * gets real app rows, each with its resource collection and permission group.
 * Both `good` and `second-app` are served. `goodAppCards` replaces the
 * `good` app's saved questions, so a spec decides which tables it reads.
 */
export function pullExampleDataApps({
  goodAppCards,
}: { goodAppCards?: ResourceEntity[] } = {}) {
  setupGitSync();
  copySyncedCollectionFixture();
  copySyncedDataAppsFixture();
  if (goodAppCards) {
    writeDataAppResources(LOCAL_GIT_PATH, {
      collection: resourceCollection(
        "goodAppCollection0000",
        "Data App: Good App",
      ),
      cards: goodAppCards,
    });
  }
  commitToRepo("Add data apps");
  configureGitAndPullChanges("read-write");
}

/** A data app whose resources loaded: it has its collection and its permission group. */
export type SyncedDataApp = DataApp & {
  resource_collection_id: number;
  permission_group_id: number;
};

/** The host app's checked-in `data_app.yaml`, as serialization reads it. */
export const DATA_APP_HOST_APP_MANIFEST = `version: 1
name: Vite 6 Data App
slug: vite-6-data-app-host-app
path: ./dist/index.js
allowed_hosts:
  - https://allowed.data-app.test
entity_id: qxpaPkU_WRE2ZQu0cmpqD
serdes/meta:
- model: DataApp
  id: qxpaPkU_WRE2ZQu0cmpqD
  label: vite-6-data-app-host-app
`;

const isSyncedDataApp = (app: DataApp): app is SyncedDataApp =>
  typeof app.resource_collection_id === "number" &&
  typeof app.permission_group_id === "number";

/**
 * Writes the app's manifest into the sync repository as `data_apps/<slug>`, makes
 * the repository's `collections/data_apps/` what the host app holds, and
 * commits them, as an author does. The bundle is a placeholder, since specs
 * serve the built one through `mockDataApp`. Pass `initializeRepo: false` to
 * write into the repository an earlier call set up.
 */
function commitDataApp(
  appRoot: string,
  slug: string,
  { initializeRepo = true }: { initializeRepo?: boolean } = {},
) {
  const appDir = `${LOCAL_GIT_PATH}/data_apps/${slug}`;
  const collectionsDir = `${LOCAL_GIT_PATH}/collections/data_apps`;

  if (initializeRepo) {
    setupGitSync();
    copySyncedCollectionFixture();
  }
  // A copy only adds, so a file the author deleted would stay in the repository.
  cy.task("removeDataAppPaths", { paths: [collectionsDir] });
  cy.task("copyDirectory", {
    source: `${appRoot}/collections/data_apps`,
    destination: collectionsDir,
  });
  cy.readFile(`${appRoot}/data_app.yaml`).then((manifest: string) =>
    cy.task("writeDataAppFiles", {
      files: {
        [`${appDir}/data_app.yaml`]: manifest,
        [`${appDir}/dist/index.js`]: "// served by the spec",
      },
    }),
  );
  commitToRepo(`Publish ${slug}`);
}

/**
 * Publishes the app with a pull and yields it once its resources loaded: with
 * its collection and its permission group, which the admin list carries.
 */
export function publishDataApp(
  appRoot: string,
  slug: string,
  options?: { initializeRepo?: boolean },
) {
  commitDataApp(appRoot, slug, options);
  configureGitAndPullChanges("read-write");

  return cy.request<DataApp[]>("/api/apps").then(({ body: apps }) => {
    const app = apps.find(({ name }) => name === slug);

    if (!app) {
      throw new Error(`The pull loaded no data app named ${slug}.`);
    }
    if (!isSyncedDataApp(app)) {
      throw new Error(
        `Data app ${slug} loaded without its resource collection or group.`,
      );
    }

    return cy.wrap(app, { log: false });
  });
}

const IMPORT_POLL_LIMIT = 120;

/** Yields the error of the import that is running or just ran, once it fails. */
function waitForImportError(retries = 0): Cypress.Chainable<string> {
  if (retries > IMPORT_POLL_LIMIT) {
    throw new Error("The import did not fail in time.");
  }

  return cy
    .request<RemoteSyncTask | null>("/api/ee/remote-sync/current-task")
    .then(({ body }) => {
      if (body?.sync_task_type === "import" && body.status === "errored") {
        return cy.wrap(body.error_message ?? "", { log: false });
      }

      if (body?.sync_task_type === "import" && body.status === "successful") {
        throw new Error(
          "The import succeeded, but its resources should have been refused.",
        );
      }

      cy.wait(500);
      return waitForImportError(retries + 1);
    });
}

/**
 * Publishes an app whose resource files the pull is expected to refuse, and
 * yields the pull's error. A refused file fails the whole pull, so nothing of
 * the app loads.
 */
export function publishDataAppExpectingRefusal(
  appRoot: string,
  slug: string,
  options?: { initializeRepo?: boolean },
) {
  commitDataApp(appRoot, slug, options);
  configureGit("read-write");
  cy.request("POST", "/api/ee/remote-sync/import", { expected_branch: "main" });

  return waitForImportError();
}

/**
 * Runs the host app's own production build. The SDK's `metabase-resource-check`
 * plugin runs on `buildStart`, so this is what refuses to bundle an app whose
 * collection files don't back its definitions.
 */
export function buildDataAppHostApp() {
  return cy.exec(`cd "${dataAppHostAppRoot()}" && npm run build`, {
    failOnNonZeroExit: false,
    timeout: 180_000,
  });
}

/** Create and assign an ordinary group for an access-control test. */
export function assignDataAppTestGroup(slug: string) {
  cy.request<GroupInfo>("POST", "/api/permissions/group", {
    name: `Test app readers: ${slug}`,
  })
    .its("body")
    .as("dataAppTestGroup");

  cy.get<GroupInfo>("@dataAppTestGroup").then(({ id }) =>
    cy.request("POST", `/api/apps/${slug}/groups`, { group_ids: [id] }),
  );

  return cy.get<GroupInfo>("@dataAppTestGroup").its("id");
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

/**
 * The `/* metadata: {...} *\/` block of the generated typed-schema entry that
 * opens with `entry` (its first match): the one at the entry's own depth, not
 * a nested entity's.
 */
export function typedSchemaMetadata(
  body: string,
  entry: string,
): Record<string, unknown> {
  const lines = body.split("\n");
  const start = lines.findIndex((line) => line.trim() === entry);
  if (start === -1) {
    throw new Error(`The typed schema has no entry \`${entry}\`.`);
  }
  const indent = lines[start].search(/\S/);
  // The entry's closing brace, so a sibling's block is never mistaken for its own.
  const end = lines.findIndex(
    (line, index) =>
      index > start &&
      line.search(/\S/) === indent &&
      line.trimStart().startsWith("}"),
  );
  const blockStart = lines.findIndex(
    (line, index) =>
      index > start &&
      index < end &&
      line.search(/\S/) === indent + 2 &&
      line.trimStart().startsWith("/* metadata: "),
  );
  if (blockStart === -1) {
    throw new Error(`The typed schema has no metadata for \`${entry}\`.`);
  }
  const blockEnd = lines.findIndex(
    (line, index) => index >= blockStart && line.trimEnd().endsWith(" */"),
  );
  const block = lines
    .slice(blockStart, blockEnd + 1)
    .join("\n")
    .trim();

  const metadata: unknown = JSON.parse(
    block.slice("/* metadata: ".length, block.length - " */".length),
  );
  if (!isObject(metadata)) {
    throw new Error(`The metadata of \`${entry}\` is not an object.`);
  }

  return metadata;
}
