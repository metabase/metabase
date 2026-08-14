import fs from "node:fs";
import path from "node:path";

import { syncResources } from "../sync";

import {
  FAKE_HASH,
  called,
  createFakeInstance,
  jsonResponse,
  makeApp,
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

describe("model reconciliation", () => {
  setupResourceSyncTests();

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

  /**
   * A live instance cannot be made to fail this way on demand, so this stays a
   * unit test: only a confirmed 404 proves a copy is gone. Recreating on any
   * other failure would duplicate content the app already owns.
   */
  it("does not recreate a copied model when reading it fails", async () => {
    const appRoot = makeApp();
    declareActions(appRoot, [{ id: 51, copiedId: 91 }]);
    seedLockfile(appRoot, [[51, 91]]);
    const fake = start(appRoot, {
      cards: [sourceModel(), copiedModel()],
      actions: [sourceAction(51, "Create"), copiedAction(91, 51, "Create")],
    });

    const served = global.fetch;
    jest
      .spyOn(global, "fetch")
      .mockImplementation(async (input, init) =>
        String(input).endsWith(`/api/card/${COPIED_MODEL_ID}`)
          ? jsonResponse({ message: "Server error" }, 500)
          : served(input, init),
      );

    await expect(sync(appRoot)).rejects.toThrow();
    expect(called(fake, "POST", "/api/card")).toBe(false);
  });

  describe("refusals", () => {
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
