import fs from "node:fs";

import { discoverActions } from "../discover";
import { MetabaseApiError, MetabaseClient } from "../metabase-client";
import { reconcileActions } from "../reconcile-actions";
import type { MetabaseAction, ResourceLockfile } from "../types";

import {
  FAKE_HASH,
  makeApp,
  setupResourceSyncTests,
  writeAction,
} from "./setup";

const COLLECTION_ID = 35;

const SOURCE: MetabaseAction = {
  id: 51,
  name: "Ship order",
  type: "query",
  model_id: null,
  collection_id: 7,
  description: null,
  parameters: [{ id: "id", type: "number/=" }],
  visualization_settings: {},
  dataset_query: { database: 1, stages: [] },
  database_id: 1,
};

const notFound = () => new MetabaseApiError(404, "Not found");

const createMockClient = () => {
  const client = new MetabaseClient("http://localhost:3000", "test-key");
  return Object.assign(client, {
    getAction: jest.spyOn(client, "getAction"),
    createAction: jest.spyOn(client, "createAction"),
    updateAction: jest.spyOn(client, "updateAction").mockResolvedValue(SOURCE),
    deleteAction: jest.spyOn(client, "deleteAction").mockResolvedValue(),
    resolveTableDependencies: jest
      .spyOn(client, "resolveTableDependencies")
      .mockResolvedValue([4]),
  });
};

function emptyLockfile(): ResourceLockfile {
  return { queries: [], actions: [], metrics: [] };
}

async function run(
  appRoot: string,
  lockfile: ResourceLockfile,
  client: ReturnType<typeof createMockClient>,
) {
  const log = jest.fn();
  const tableIds = await reconcileActions({
    appRoot,
    slug: "orders",
    collectionId: COLLECTION_ID,
    actions: await discoverActions(appRoot),
    lockfile,
    client,
    log,
  });
  return { tableIds, log };
}

describe("action reconciliation", () => {
  setupResourceSyncTests();

  it("copies a declared action into the app collection and injects the copy's id", async () => {
    const appRoot = makeApp();
    const file = writeAction(
      appRoot,
      `export const Ship = defineAction({ action: { id: 51, parameters: [] } });`,
    );
    const client = createMockClient();
    client.getAction.mockResolvedValueOnce(SOURCE);
    client.createAction.mockResolvedValue({ ...SOURCE, id: 91 });
    const lockfile = emptyLockfile();

    const { tableIds } = await run(appRoot, lockfile, client);

    expect(client.createAction).toHaveBeenCalledWith({
      name: "Ship order",
      type: "query",
      description: null,
      visualization_settings: {},
      parameters: [{ id: "id", type: "number/=" }],
      dataset_query: { database: 1, stages: [] },
      database_id: 1,
      collection_id: COLLECTION_ID,
    });
    expect(lockfile.actions).toEqual([
      { sourceActionId: 51, copiedActionId: 91, hash: expect.any(String) },
    ]);
    expect(fs.readFileSync(file, "utf8")).toContain("copiedActionId: 91");
    expect(client.resolveTableDependencies).toHaveBeenCalledWith("orders", [
      SOURCE.dataset_query,
    ]);
    expect(tableIds).toEqual([4]);
  });

  it("refuses an action that belongs to a model", async () => {
    const appRoot = makeApp();
    writeAction(
      appRoot,
      `export const Ship = defineAction({ action: { id: 51, parameters: [] } });`,
    );
    const client = createMockClient();
    client.getAction.mockResolvedValueOnce({ ...SOURCE, model_id: 80 });

    await expect(run(appRoot, emptyLockfile(), client)).rejects.toThrow(
      "which is not a query action without a model",
    );
    expect(client.createAction).not.toHaveBeenCalled();
  });

  it("updates a copy that drifted from its source", async () => {
    const appRoot = makeApp();
    writeAction(
      appRoot,
      `export const Ship = defineAction({ copiedActionId: 91, action: { id: 51, parameters: [] } });`,
    );
    const client = createMockClient();
    client.getAction.mockResolvedValueOnce(SOURCE).mockResolvedValueOnce({
      ...SOURCE,
      id: 91,
      name: "Old name",
      collection_id: COLLECTION_ID,
    });
    const lockfile: ResourceLockfile = {
      ...emptyLockfile(),
      actions: [{ sourceActionId: 51, copiedActionId: 91, hash: FAKE_HASH }],
    };

    await run(appRoot, lockfile, client);

    expect(client.updateAction).toHaveBeenCalledWith(
      91,
      expect.objectContaining({ name: "Ship order" }),
    );
    expect(client.createAction).not.toHaveBeenCalled();
  });

  it("recreates a copy that was deleted in Metabase", async () => {
    const appRoot = makeApp();
    writeAction(
      appRoot,
      `export const Ship = defineAction({ copiedActionId: 91, action: { id: 51, parameters: [] } });`,
    );
    const client = createMockClient();
    client.getAction
      .mockResolvedValueOnce(SOURCE)
      .mockRejectedValueOnce(notFound());
    client.createAction.mockResolvedValue({ ...SOURCE, id: 92 });
    const lockfile: ResourceLockfile = {
      ...emptyLockfile(),
      actions: [{ sourceActionId: 51, copiedActionId: 91, hash: FAKE_HASH }],
    };

    await run(appRoot, lockfile, client);

    expect(lockfile.actions).toEqual([
      { sourceActionId: 51, copiedActionId: 92, hash: expect.any(String) },
    ]);
  });

  it("leaves a copy that moved out of the app collection untouched", async () => {
    const appRoot = makeApp();
    writeAction(
      appRoot,
      `export const Ship = defineAction({ copiedActionId: 91, action: { id: 51, parameters: [] } });`,
    );
    const client = createMockClient();
    client.getAction
      .mockResolvedValueOnce(SOURCE)
      .mockResolvedValueOnce({ ...SOURCE, id: 91, collection_id: 8 });
    const lockfile: ResourceLockfile = {
      ...emptyLockfile(),
      actions: [{ sourceActionId: 51, copiedActionId: 91, hash: FAKE_HASH }],
    };

    await expect(run(appRoot, lockfile, client)).rejects.toThrow(
      "is no longer in data app collection 35",
    );
    expect(client.updateAction).not.toHaveBeenCalled();
  });

  it("deletes the copy of an action whose declaration was removed", async () => {
    const appRoot = makeApp();
    const client = createMockClient();
    client.getAction.mockResolvedValueOnce({
      ...SOURCE,
      id: 91,
      collection_id: COLLECTION_ID,
    });
    const lockfile: ResourceLockfile = {
      ...emptyLockfile(),
      actions: [{ sourceActionId: 51, copiedActionId: 91, hash: FAKE_HASH }],
    };

    await run(appRoot, lockfile, client);

    expect(client.deleteAction).toHaveBeenCalledWith(91);
    expect(lockfile.actions).toEqual([]);
  });

  it("refuses a declared action that is one of the app's own copies", async () => {
    const appRoot = makeApp();
    writeAction(
      appRoot,
      `export const Ship = defineAction({ action: { id: 91, parameters: [] } });`,
    );
    const client = createMockClient();
    client.getAction.mockResolvedValueOnce({
      ...SOURCE,
      id: 91,
      collection_id: COLLECTION_ID,
    });

    await expect(run(appRoot, emptyLockfile(), client)).rejects.toThrow(
      "which is a copy synchronized into this data app",
    );
    expect(client.createAction).not.toHaveBeenCalled();
    expect(client.deleteAction).not.toHaveBeenCalled();
  });

  it("adopts the copy a declaration names when its lockfile entry was lost", async () => {
    const appRoot = makeApp();
    writeAction(
      appRoot,
      `export const Ship = defineAction({ copiedActionId: 91, action: { id: 51, parameters: [] } });`,
    );
    const client = createMockClient();
    client.getAction.mockResolvedValueOnce(SOURCE).mockResolvedValueOnce({
      ...SOURCE,
      id: 91,
      collection_id: COLLECTION_ID,
    });
    const lockfile = emptyLockfile();

    await run(appRoot, lockfile, client);

    expect(client.createAction).not.toHaveBeenCalled();
    expect(lockfile.actions).toEqual([
      { sourceActionId: 51, copiedActionId: 91, hash: expect.any(String) },
    ]);
  });

  it("leaves a copy that moved out of the app collection when its declaration is removed", async () => {
    const appRoot = makeApp();
    const client = createMockClient();
    client.getAction.mockResolvedValueOnce({
      ...SOURCE,
      id: 91,
      collection_id: 8,
    });
    const lockfile: ResourceLockfile = {
      ...emptyLockfile(),
      actions: [{ sourceActionId: 51, copiedActionId: 91, hash: FAKE_HASH }],
    };

    await expect(run(appRoot, lockfile, client)).rejects.toThrow(
      "is no longer in data app collection 35",
    );
    expect(client.deleteAction).not.toHaveBeenCalled();
  });
});
