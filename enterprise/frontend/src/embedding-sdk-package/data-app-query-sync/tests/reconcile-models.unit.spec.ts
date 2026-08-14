import fs from "node:fs";
import path from "node:path";

import { syncResources } from "../sync";

import type { FakeInstance } from "./setup";
import {
  FAKE_HASH,
  called,
  createFakeInstance,
  makeApp,
  readLockfile,
  serveFakeInstance,
  setupResourceSyncTests,
  writeAction,
} from "./setup";

const COLLECTION_ID = 20;
const SOURCE_MODEL_ID = 5;
const COPIED_MODEL_ID = 80;

function sourceModel(overrides: Record<string, unknown> = {}) {
  return {
    id: SOURCE_MODEL_ID,
    name: "Orders",
    type: "model",
    collection_id: 3,
    database_id: 1,
    dataset_query: { database: 1 },
    display: "table",
    visualization_settings: {},
    ...overrides,
  };
}

function sourceAction(id: number, name: string) {
  return {
    id,
    name,
    type: "implicit",
    kind: "row/create",
    model_id: SOURCE_MODEL_ID,
    archived: false,
  };
}

/** The model as synchronization copies it: same content, inside the app collection. */
function copiedModel(overrides: Record<string, unknown> = {}) {
  return {
    ...sourceModel(),
    id: COPIED_MODEL_ID,
    collection_id: COLLECTION_ID,
    ...overrides,
  };
}

/** A copied action, hanging off the copied model rather than the source. */
function copiedAction(id: number, sourceId: number, name: string) {
  return { ...sourceAction(sourceId, name), id, model_id: COPIED_MODEL_ID };
}

/**
 * Writes the app's `actions/`, declaring one `defineAction` per entry.
 * `copiedId` is the generated ID, present only once synchronization injected it.
 */
function declareActions(
  appRoot: string,
  declarations: Array<{ id: number; copiedId?: number }>,
) {
  return writeAction(
    appRoot,
    declarations
      .map(({ id, copiedId }) => {
        const generated =
          copiedId === undefined ? "" : `copiedActionId: ${copiedId}, `;
        return `export const Action${id} = defineAction({ ${generated}action: { id: ${id}, parameters: [] } });`;
      })
      .join("\n"),
  );
}

function seedLockfile(appRoot: string, actions: number[][]) {
  fs.writeFileSync(
    path.join(appRoot, "resources_metadata.json"),
    JSON.stringify({
      queries: [],
      models: [
        {
          sourceModelId: SOURCE_MODEL_ID,
          copiedModelId: COPIED_MODEL_ID,
          hash: FAKE_HASH,
          actions: actions.map(([sourceActionId, copiedActionId]) => ({
            sourceActionId,
            copiedActionId,
            hash: FAKE_HASH,
          })),
        },
      ],
    }),
  );
}

async function sync(appRoot: string) {
  await syncResources({
    appRoot,
    metabaseUrl: "http://metabase.test",
    apiKey: "secret",
    log: jest.fn(),
  });
}

function start(
  appRoot: string,
  seed: Parameters<typeof createFakeInstance>[0],
) {
  const fake = createFakeInstance(seed);
  serveFakeInstance(fake, {
    slug: path.basename(appRoot),
    collectionId: COLLECTION_ID,
  });
  return fake;
}

/** The common starting point: one declared action on an un-copied source model. */
function singleActionApp() {
  const appRoot = makeApp();
  declareActions(appRoot, [{ id: 51 }]);
  const fake = start(appRoot, {
    cards: [sourceModel()],
    actions: [sourceAction(51, "Create")],
  });
  return { appRoot, fake };
}

describe("model reconciliation", () => {
  setupResourceSyncTests();

  it("copies a model once and reuses it for a sibling action", async () => {
    const appRoot = makeApp();
    const filePath = declareActions(appRoot, [{ id: 51 }, { id: 52 }]);
    const fake = start(appRoot, {
      cards: [sourceModel()],
      actions: [sourceAction(51, "Create"), sourceAction(52, "Update")],
    });

    await sync(appRoot);

    const created = (pathname: string) =>
      fake.requests.filter(
        (request) => request.method === "POST" && request.pathname === pathname,
      );
    expect(created("/api/card")).toHaveLength(1);
    expect(created("/api/card")[0].body).toMatchObject({
      type: "model",
      collection_id: COLLECTION_ID,
    });
    expect(created("/api/action")).toHaveLength(2);

    const { models } = readLockfile(appRoot);
    expect(models).toHaveLength(1);
    expect(models[0].sourceModelId).toBe(SOURCE_MODEL_ID);
    expect(models[0].actions.map((entry) => entry.sourceActionId)).toEqual([
      51, 52,
    ]);

    // Both copies hang off the copied model, which is what makes them readable
    // by the data app's permission group.
    const contents = fs.readFileSync(filePath, "utf8");
    for (const entry of models[0].actions) {
      expect(fake.actions.get(entry.copiedActionId)?.model_id).toBe(
        models[0].copiedModelId,
      );
      expect(contents).toContain(`copiedActionId: ${entry.copiedActionId}`);
    }
  });

  it("is unchanged on a repeated sync", async () => {
    const { appRoot, fake } = singleActionApp();

    await sync(appRoot);
    const afterFirst = readLockfile(appRoot);
    fake.requests.length = 0;

    await sync(appRoot);

    expect(readLockfile(appRoot)).toEqual(afterFirst);
    expect(called(fake, "POST", "/api/card")).toBe(false);
    expect(called(fake, "POST", "/api/action")).toBe(false);
  });

  it("deletes only the copied action when a sibling action remains", async () => {
    const appRoot = makeApp();
    declareActions(appRoot, [{ id: 51, copiedId: 91 }]);
    seedLockfile(appRoot, [
      [51, 91],
      [52, 92],
    ]);
    const fake = start(appRoot, {
      cards: [sourceModel(), copiedModel()],
      actions: [
        sourceAction(51, "Create"),
        copiedAction(91, 51, "Create"),
        copiedAction(92, 52, "Update"),
      ],
    });

    await sync(appRoot);

    expect(called(fake, "DELETE", "/api/action/92")).toBe(true);
    expect(called(fake, "DELETE", `/api/card/${COPIED_MODEL_ID}`)).toBe(false);
    expect(fake.cards.has(COPIED_MODEL_ID)).toBe(true);

    const { models } = readLockfile(appRoot);
    expect(models).toHaveLength(1);
    expect(models[0].copiedModelId).toBe(COPIED_MODEL_ID);
    expect(models[0].actions).toEqual([
      { sourceActionId: 51, copiedActionId: 91, hash: expect.any(String) },
    ]);
  });

  it("deletes the copied model once its last action is removed", async () => {
    const appRoot = makeApp();
    seedLockfile(appRoot, [[51, 91]]);
    const fake = start(appRoot, {
      cards: [copiedModel()],
      actions: [copiedAction(91, 51, "Create")],
    });

    await sync(appRoot);

    expect(called(fake, "DELETE", `/api/card/${COPIED_MODEL_ID}`)).toBe(true);
    expect(readLockfile(appRoot).models).toEqual([]);
    // The copied action goes with its model rather than needing its own delete.
    expect(called(fake, "DELETE", "/api/action/91")).toBe(false);
    expect(fake.actions.has(91)).toBe(false);
  });

  it("recreates a copied model only after a confirmed 404", async () => {
    const appRoot = makeApp();
    const filePath = declareActions(appRoot, [{ id: 51, copiedId: 91 }]);
    seedLockfile(appRoot, [[51, 91]]);
    start(appRoot, {
      cards: [sourceModel()],
      actions: [sourceAction(51, "Create")],
    });

    await sync(appRoot);

    const { models } = readLockfile(appRoot);
    expect(models).toHaveLength(1);
    expect(models[0].copiedModelId).not.toBe(COPIED_MODEL_ID);
    expect(models[0].actions).toHaveLength(1);
    expect(fs.readFileSync(filePath, "utf8")).toContain(
      `copiedActionId: ${models[0].actions[0].copiedActionId}`,
    );
  });

  it("makes a query action's own database viewable, not just its model's", async () => {
    const appRoot = makeApp();
    declareActions(appRoot, [{ id: 61 }]);
    const fake = start(appRoot, {
      cards: [sourceModel()],
      actions: [
        {
          id: 61,
          name: "Run Report",
          type: "query",
          model_id: SOURCE_MODEL_ID,
          archived: false,
          // Deliberately not the model's database (1).
          database_id: 7,
          dataset_query: { database: 7 },
        },
      ],
    });

    await sync(appRoot);

    const permissions = fake.requests.find(
      (request) =>
        request.method === "PUT" && request.pathname.endsWith("/permissions"),
    );
    expect(permissions?.body).toEqual({ database_ids: [1, 7] });
  });

  it("explains how to recover a copied model that left the collection", async () => {
    const appRoot = makeApp();
    seedLockfile(appRoot, [[51, 91]]);
    const fake = start(appRoot, {
      cards: [copiedModel({ collection_id: 99 })],
    });

    await expect(sync(appRoot)).rejects.toThrow(
      `Move card ${COPIED_MODEL_ID} back to data app collection ${COLLECTION_ID} or delete it manually, then run sync-resources again.`,
    );
    expect(fake.cards.has(COPIED_MODEL_ID)).toBe(true);
  });

  it("restores a missing generated ID from the lockfile", async () => {
    const appRoot = makeApp();
    const filePath = declareActions(appRoot, [{ id: 51 }]);
    seedLockfile(appRoot, [[51, 91]]);
    const fake = start(appRoot, {
      cards: [sourceModel(), copiedModel()],
      actions: [sourceAction(51, "Create"), copiedAction(91, 51, "Create")],
    });

    await sync(appRoot);

    expect(fs.readFileSync(filePath, "utf8")).toContain("copiedActionId: 91");
    expect(called(fake, "POST", "/api/action")).toBe(false);
    expect(called(fake, "POST", "/api/card")).toBe(false);
  });

  describe("drift in the source", () => {
    /** Syncs once so the lockfile holds real fingerprints, then hands back the copies. */
    async function syncThenReset(appRoot: string, fake: FakeInstance) {
      await sync(appRoot);
      const [model] = readLockfile(appRoot).models;
      fake.requests.length = 0;
      return {
        copiedModelId: model.copiedModelId,
        copiedActionId: model.actions[0].copiedActionId,
      };
    }

    it("updates the copied model when the source model changes", async () => {
      const { appRoot, fake } = singleActionApp();
      const { copiedModelId } = await syncThenReset(appRoot, fake);

      fake.cards.set(SOURCE_MODEL_ID, { ...sourceModel(), name: "Orders v2" });
      await sync(appRoot);

      expect(called(fake, "PUT", `/api/card/${copiedModelId}`)).toBe(true);
      expect(fake.cards.get(copiedModelId)?.name).toBe("Orders v2");
      expect(called(fake, "POST", "/api/card")).toBe(false);
    });

    it("updates the copied action when the source action changes", async () => {
      const { appRoot, fake } = singleActionApp();
      const { copiedActionId } = await syncThenReset(appRoot, fake);

      fake.actions.set(51, {
        ...sourceAction(51, "Create"),
        description: "now documented",
      });
      await sync(appRoot);

      expect(called(fake, "PUT", `/api/action/${copiedActionId}`)).toBe(true);
      expect(fake.actions.get(copiedActionId)?.description).toBe(
        "now documented",
      );
      expect(called(fake, "POST", "/api/action")).toBe(false);
    });

    it("recreates only the copied action when it is deleted in Metabase", async () => {
      const { appRoot, fake } = singleActionApp();
      const { copiedModelId, copiedActionId } = await syncThenReset(
        appRoot,
        fake,
      );

      fake.actions.delete(copiedActionId);
      await sync(appRoot);

      // The model survives; only its action is replaced.
      expect(called(fake, "POST", "/api/card")).toBe(false);
      const [model] = readLockfile(appRoot).models;
      expect(model.copiedModelId).toBe(copiedModelId);
      expect(model.actions[0].copiedActionId).not.toBe(copiedActionId);
      expect(fake.actions.get(model.actions[0].copiedActionId)?.model_id).toBe(
        copiedModelId,
      );
    });
  });

  describe("refusals", () => {
    it("refuses to delete a copied action repointed at another model", async () => {
      const appRoot = makeApp();
      declareActions(appRoot, [{ id: 51, copiedId: 91 }]);
      seedLockfile(appRoot, [
        [51, 91],
        [52, 92],
      ]);
      const fake = start(appRoot, {
        cards: [sourceModel(), copiedModel()],
        actions: [
          sourceAction(51, "Create"),
          copiedAction(91, 51, "Create"),
          // Action 92's declaration is gone, but it now hangs off a model we
          // do not own, so deleting it would destroy someone else's action.
          { ...copiedAction(92, 52, "Update"), model_id: 999 },
        ],
      });

      await expect(sync(appRoot)).rejects.toThrow(
        `no longer hangs off copied model ${COPIED_MODEL_ID}`,
      );
      expect(fake.actions.has(92)).toBe(true);
    });

    it("refuses to touch a copy that is no longer a model", async () => {
      const appRoot = makeApp();
      seedLockfile(appRoot, [[51, 91]]);
      const fake = start(appRoot, {
        cards: [copiedModel({ type: "question" })],
      });

      await expect(sync(appRoot)).rejects.toThrow("is no longer a model");
      expect(fake.cards.has(COPIED_MODEL_ID)).toBe(true);
    });

    it("rejects an archived source action", async () => {
      const appRoot = makeApp();
      declareActions(appRoot, [{ id: 51 }]);
      const fake = start(appRoot, {
        cards: [sourceModel()],
        actions: [{ ...sourceAction(51, "Create"), archived: true }],
      });

      await expect(sync(appRoot)).rejects.toThrow(
        "references archived action 51",
      );
      expect(called(fake, "POST", "/api/card")).toBe(false);
    });

    it("rejects an action whose parent card is not a model", async () => {
      const appRoot = makeApp();
      declareActions(appRoot, [{ id: 51 }]);
      const fake = start(appRoot, {
        cards: [sourceModel({ type: "question" })],
        actions: [sourceAction(51, "Create")],
      });

      await expect(sync(appRoot)).rejects.toThrow(
        `references an action on card ${SOURCE_MODEL_ID}, which is not a model`,
      );
      expect(called(fake, "POST", "/api/card")).toBe(false);
    });
  });
});
