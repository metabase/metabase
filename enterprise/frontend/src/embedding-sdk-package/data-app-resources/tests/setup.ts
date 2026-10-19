import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { dump as dumpYaml } from "js-yaml";

import { repoRootOf } from "../resources";

const appRoots: string[] = [];

/** Removes every app `makeApp` created and restores mocks after each test. */
export function setupResourceTests(): void {
  afterEach(() => {
    jest.restoreAllMocks();

    appRoots
      .splice(0)
      .forEach((appRoot) =>
        fs.rmSync(appRoot, { recursive: true, force: true }),
      );
  });
}

/** The entity ID of the collection `makeApp`'s manifest names. */
export const COLLECTION = "appCollectionEntity01";

/**
 * Creates an app with `queries/`, `actions/`, a manifest naming `COLLECTION`,
 * the collection's file, and a stub of the SDK's data-app entry. The app is
 * its own repository root, or lives at `data_apps/shop/` under one with
 * `underDataApps`.
 */
export function makeApp({ underDataApps = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "data-app-resources-"));
  appRoots.push(root);

  const appRoot = underDataApps ? path.join(root, "data_apps", "shop") : root;

  fs.mkdirSync(path.join(appRoot, "queries"), { recursive: true });
  fs.mkdirSync(path.join(appRoot, "actions"));
  fs.writeFileSync(
    path.join(appRoot, "data_app.yaml"),
    dumpYaml({
      name: "Shop",
      slug: "shop",
      path: "dist/index.js",
      collection: COLLECTION,
      entity_id: "appEntityId0000000001",
      "serdes/meta": [
        { model: "DataApp", id: "appEntityId0000000001", label: "shop" },
      ],
    }),
  );
  writeResource(appRoot, "data_app.yaml", {
    name: "Data App: Shop",
    namespace: "data-apps",
    entity_id: COLLECTION,
    "serdes/meta": [{ model: "Collection", id: COLLECTION }],
  });

  const packageRoot = path.join(
    appRoot,
    "node_modules/@metabase/embedding-sdk-react",
  );

  fs.mkdirSync(packageRoot, { recursive: true });
  fs.writeFileSync(
    path.join(packageRoot, "package.json"),
    JSON.stringify({
      name: "@metabase/embedding-sdk-react",
      exports: { "./data-app": "./data-app.js" },
    }),
  );

  fs.writeFileSync(
    path.join(packageRoot, "data-app.js"),
    [
      "exports.defineQuery = (query) => query;",
      "exports.defineAction = (definition) => definition;",
    ].join("\n"),
  );

  return appRoot;
}

export function writeAction(appRoot: string, body: string) {
  const filePath = path.join(appRoot, "actions/orders.action.ts");
  fs.writeFileSync(
    filePath,
    `import { defineAction } from "@metabase/embedding-sdk-react/data-app";\n${body}\n`,
  );
  return filePath;
}

export function writeQuery(appRoot: string, body: string) {
  const filePath = path.join(appRoot, "queries/orders.query.ts");
  fs.writeFileSync(
    filePath,
    `import { defineQuery } from "@metabase/embedding-sdk-react/data-app";\n${body}\n`,
  );
  return filePath;
}

/**
 * Writes `entity` as YAML to `collections/data_apps/<relativePath>` of the
 * app's repository, in the app's collection unless the entity says otherwise.
 */
export function writeResource(
  appRoot: string,
  relativePath: string,
  entity: Record<string, unknown>,
) {
  const filePath = path.join(
    repoRootOf(appRoot),
    "collections/data_apps",
    relativePath,
  );
  const inCollection =
    entity["serdes/meta"] === undefined ||
    modelOf(entity) === "Collection" ||
    "collection_id" in entity
      ? entity
      : { ...entity, collection_id: COLLECTION };

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, dumpYaml(inCollection));
  return filePath;
}

function modelOf(entity: Record<string, unknown>) {
  const meta = entity["serdes/meta"];
  const leaf = Array.isArray(meta) ? meta[meta.length - 1] : undefined;
  return typeof leaf === "object" && leaf !== null && "model" in leaf
    ? leaf.model
    : undefined;
}
