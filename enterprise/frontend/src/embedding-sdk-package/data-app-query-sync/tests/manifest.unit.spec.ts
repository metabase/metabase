import fs from "node:fs";
import path from "node:path";

import { addResourceEntityIdsToManifest } from "../manifest";

import { makeApp, setupQuerySyncTests } from "./setup";

describe("data app manifest resource IDs", () => {
  setupQuerySyncTests();

  it("adds both server-issued entity IDs without rewriting the manifest", () => {
    const appRoot = makeApp();
    const manifestPath = path.join(appRoot, "data_app.yaml");
    fs.writeFileSync(
      manifestPath,
      "# Keep this comment\n" +
        "name: Test data app\n" +
        "path: dist/index.js\n" +
        "\n" +
        "# Keep resource IDs above this configuration comment\n" +
        "# allowed_hosts:\n",
    );

    addResourceEntityIdsToManifest(appRoot, {
      resourceCollectionEntityId: "resourcecollectionid1",
      permissionGroupEntityId: "permissiongroupid0001",
    });

    expect(fs.readFileSync(manifestPath, "utf8")).toBe(
      "# Keep this comment\n" +
        "name: Test data app\n" +
        "path: dist/index.js\n" +
        "resource_collection_entity_id: resourcecollectionid1\n" +
        "permission_group_entity_id: permissiongroupid0001\n" +
        "\n" +
        "# Keep resource IDs above this configuration comment\n" +
        "# allowed_hosts:\n",
    );
  });

  it("preserves an entity ID that is already in the manifest", () => {
    const appRoot = makeApp();
    const manifestPath = path.join(appRoot, "data_app.yaml");
    fs.appendFileSync(
      manifestPath,
      "resource_collection_entity_id: manuallychangedid0001\n",
    );

    addResourceEntityIdsToManifest(appRoot, {
      resourceCollectionEntityId: "resourcecollectionid1",
      permissionGroupEntityId: "permissiongroupid0001",
    });

    expect(fs.readFileSync(manifestPath, "utf8")).toContain(
      "resource_collection_entity_id: manuallychangedid0001",
    );
    expect(fs.readFileSync(manifestPath, "utf8")).toContain(
      "permission_group_entity_id: permissiongroupid0001",
    );
  });

  it("requires a manifest path", () => {
    const appRoot = makeApp();
    const manifestPath = path.join(appRoot, "data_app.yaml");
    fs.writeFileSync(manifestPath, "name: Test data app\n");

    expect(() =>
      addResourceEntityIdsToManifest(appRoot, {
        resourceCollectionEntityId: "resourcecollectionid1",
        permissionGroupEntityId: "permissiongroupid0001",
      }),
    ).toThrow("data_app.yaml must define a path.");
  });

  it("rejects an invalid server-issued entity ID", () => {
    const appRoot = makeApp();

    expect(() =>
      addResourceEntityIdsToManifest(appRoot, {
        resourceCollectionEntityId: "short",
        permissionGroupEntityId: "permissiongroupid0001",
      }),
    ).toThrow("Metabase returned an invalid resource_collection_entity_id.");
  });
});
