import yaml from "js-yaml";

import { USERS, USER_GROUPS } from "e2e/support/cypress_data";
import * as Urls from "metabase/urls/data-apps";
import type {
  CreateDataAppRequest,
  DataApp,
  DataAppGroup,
  GroupId,
  GroupInfo,
  TableId,
} from "metabase-types/api";

import { createLibrary, publishTables, updateSetting } from "./api";
import { getIframeBody } from "./e2e-embedding-helpers";
import {
  LOCAL_GIT_PATH,
  commitToRepo,
  configureGitAndPullChanges,
  copySyncedCollectionFixture,
  setupGitSync,
} from "./e2e-remote-sync-helpers";

const DATA_APP_FIXTURES_PATH = "e2e/support/assets/data-apps";

export const DATA_APP_NAME = "kitchen-sink";
export const DATA_APP_DISPLAY_NAME = "Kitchen Sink";

export const visitDataAppRoute = (route: string) => {
  installDataAppScopeGuard();
  return cy.visit(`/apps/${DATA_APP_NAME}/${route}`);
};

export function createDataApp(
  details: CreateDataAppRequest,
): Cypress.Chainable<DataApp> {
  return cy
    .request<DataApp>("POST", "/api/ee/apps", details)
    .then(({ body }) => body);
}

export function addDataAppGroups(
  app: Pick<DataApp, "name">,
  groupIds: GroupId[],
): Cypress.Chainable<DataAppGroup[]> {
  return cy
    .request<DataAppGroup[]>("POST", `/api/ee/apps/${app.name}/groups`, {
      group_ids: groupIds,
    })
    .then(({ body }) => body);
}

/**
 * Writes `app`'s typed schema to `src/metabase.ts` of the fixture directory named
 * `app.name`, builds that fixture, and uploads the build as the app's bundle.
 */
export function uploadDataAppBundle(
  app: Pick<DataApp, "name">,
): Cypress.Chainable<DataApp> {
  return cy
    .request<string>(`/api/ee/apps/${app.name}/typed-schema`)
    .then(({ body: typedSchema }) =>
      cy.task("writeDataAppFiles", {
        files: {
          [`${DATA_APP_FIXTURES_PATH}/${app.name}/src/metabase.ts`]:
            typedSchema,
        },
      }),
    )
    .then(() => cy.task<string>("buildDataApp", { appName: app.name }))
    .then((bundle) =>
      cy.request<DataApp>("PUT", `/api/ee/apps/${app.name}/bundle`, {
        bundle,
      }),
    )
    .then(({ body }) => body);
}

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
  updateSetting("remote-sync-custom-collections-enabled", true);
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

/** A data app whose resources loaded into its collection. */
export type SyncedDataApp = DataApp & {
  resource_collection_id: number;
};

const isSyncedDataApp = (app: DataApp): app is SyncedDataApp =>
  typeof app.resource_collection_id === "number";

/**
 * Writes the app's manifest into the sync repository as `data_apps/<slug>`, makes
 * the repository's `collections/data_apps/` what the host app holds, and
 * commits them, as an author does. The bundle is a placeholder that every pull
 * loads again, so a spec uploads the built one with `uploadDataAppBundle` after
 * its last pull. Pass `initializeRepo: false` to write into the repository an
 * earlier call set up.
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
    updateSetting("remote-sync-custom-collections-enabled", true);
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
        [`${appDir}/dist/index.js`]: "// uploaded by the spec",
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

  return cy.request<DataApp[]>("/api/ee/apps").then(({ body: apps }) => {
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

/** Creates a group and adds it to `app`'s groups, yielding the group's ID. */
export function assignTestGroupToDataApp(
  app: Pick<DataApp, "name">,
): Cypress.Chainable<GroupId> {
  return cy
    .request<GroupInfo>("POST", "/api/permissions/group", {
      name: `Data app test group: ${app.name}`,
    })
    .then(({ body: group }) =>
      addDataAppGroups(app, [group.id]).then(() => group.id),
    );
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

const DATA_APP_DEV_SLUG = "vite-6-data-app-host-app";

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
  createDataApp({
    name: DATA_APP_DEV_SLUG,
    allowed_hosts: ["https://allowed.data-app.test"],
  });

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
