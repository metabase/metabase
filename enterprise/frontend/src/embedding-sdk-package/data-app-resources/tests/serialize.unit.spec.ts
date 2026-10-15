import fs from "node:fs";
import path from "node:path";

import { serializeResources } from "../serialize";

import { makeApp, setupResourceTests, writeAction, writeQuery } from "./setup";

const QUESTION = "questionEntityId00010";
const ACTION_COPY = "actionCopyEntityId001";

const COLLECTION = "appCollectionEntity01";

const SERIALIZED = {
  queries: [
    {
      export: "Orders",
      entity: {
        entity_id: QUESTION,
        collection_id: COLLECTION,
        name: "Orders",
        dataset_query: { database: "Sample Database" },
      },
      metrics: [],
    },
  ],
  actions: [{ id: 51, entity: { entity_id: "sourceActionEntity051" } }],
  metrics: [],
};

function appWithDefinitions() {
  const appRoot = makeApp();
  fs.writeFileSync(
    path.join(appRoot, ".env.local"),
    "DATA_APP_MB_URL=http://metabase.test/\nDATA_APP_MB_API_KEY=mb_test_key\n",
  );
  fs.writeFileSync(
    path.join(appRoot, "data_app.yaml"),
    `name: Orders\npath: ./dist/index.js\ncollection: ${COLLECTION}\n`,
  );
  writeQuery(
    appRoot,
    `export const Orders = defineQuery({ savedQuestionEntityId: "${QUESTION}", source: { type: "table", id: 1 }, limit: 5 });`,
  );
  writeAction(
    appRoot,
    `export const Create = defineAction({ copiedActionEntityId: "${ACTION_COPY}", action: { id: 51, parameters: [] } });`,
  );
  return appRoot;
}

function mockSerialization(response: Response) {
  return jest.spyOn(global, "fetch").mockResolvedValue(response);
}

describe("serializing what resources are written from", () => {
  setupResourceTests();

  it("refuses to print before the manifest names the app's collection", async () => {
    const appRoot = appWithDefinitions();
    fs.writeFileSync(
      path.join(appRoot, "data_app.yaml"),
      "name: Orders\npath: ./dist/index.js\n",
    );
    const fetchSpy = mockSerialization(
      new Response(JSON.stringify(SERIALIZED)),
    );

    await expect(serializeResources(appRoot)).rejects.toThrow(
      "names the app's collection",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses to print a query that has no saved question ID yet", async () => {
    const appRoot = appWithDefinitions();
    fs.appendFileSync(
      path.join(appRoot, "queries/orders.query.ts"),
      `export const Products = defineQuery({ source: { type: "table", id: 2 } });\n`,
    );
    const fetchSpy = mockSerialization(
      new Response(JSON.stringify(SERIALIZED)),
    );

    await expect(serializeResources(appRoot)).rejects.toThrow(
      "queries/orders.query.ts:Products has no savedQuestionEntityId.",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends the definitions with their IDs, the app's collection, and the action IDs in one request, and prints the serialization beside each definition", async () => {
    const appRoot = appWithDefinitions();
    const fetchSpy = mockSerialization(
      new Response(JSON.stringify(SERIALIZED)),
    );

    const printed = JSON.parse(await serializeResources(appRoot));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("http://metabase.test/api/apps/serialize-resources");
    expect(init?.headers).toEqual({
      "Content-Type": "application/json",
      "X-API-Key": "mb_test_key",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      collection: COLLECTION,
      queries: [
        {
          export: "Orders",
          entity_id: QUESTION,
          query: { stages: [{ source: { type: "table", id: 1 }, limit: 5 }] },
        },
      ],
      actions: [51],
    });
    expect(printed).toEqual({
      queries: [
        {
          export: "Orders",
          file: "queries/orders.query.ts",
          savedQuestionEntityId: QUESTION,
          entity: SERIALIZED.queries[0].entity,
          metrics: [],
        },
      ],
      actions: [
        {
          export: "Create",
          file: "actions/orders.action.ts",
          copiedActionEntityId: ACTION_COPY,
          id: 51,
          entity: { entity_id: "sourceActionEntity051" },
        },
      ],
      metrics: [],
    });
  });

  it("sends only the definitions in the given file", async () => {
    const appRoot = appWithDefinitions();
    const fetchSpy = mockSerialization(
      new Response(JSON.stringify({ ...SERIALIZED, actions: [] })),
    );

    await serializeResources(appRoot, "queries/orders.query.ts");

    expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))).toEqual({
      collection: COLLECTION,
      queries: [expect.objectContaining({ export: "Orders" })],
      actions: [],
    });
  });

  it("fails for a file with no definitions", async () => {
    const appRoot = appWithDefinitions();

    await expect(serializeResources(appRoot, "src/App.tsx")).rejects.toThrow(
      "src/App.tsx has no defineQuery or defineAction definitions.",
    );
  });

  it("fails without the Metabase instance and API key", async () => {
    const appRoot = appWithDefinitions();
    fs.rmSync(path.join(appRoot, ".env.local"));
    // The shell's own variables would stand in for the file.
    const shell = {
      url: process.env.DATA_APP_MB_URL,
      key: process.env.DATA_APP_MB_API_KEY,
    };
    delete process.env.DATA_APP_MB_URL;
    delete process.env.DATA_APP_MB_API_KEY;

    try {
      await expect(serializeResources(appRoot)).rejects.toThrow(
        "DATA_APP_MB_URL and DATA_APP_MB_API_KEY must be set, in the repo-root .env.local or the environment.",
      );
    } finally {
      if (shell.url !== undefined) {
        process.env.DATA_APP_MB_URL = shell.url;
      }
      if (shell.key !== undefined) {
        process.env.DATA_APP_MB_API_KEY = shell.key;
      }
    }
  });

  it("fails when the response has a query too few", async () => {
    const appRoot = appWithDefinitions();
    mockSerialization(
      new Response(JSON.stringify({ ...SERIALIZED, queries: [] })),
    );

    await expect(serializeResources(appRoot)).rejects.toThrow(
      "The serialization response holds 0 queries; 1 were requested.",
    );
  });

  it("fails when the response lacks a requested action", async () => {
    const appRoot = appWithDefinitions();
    mockSerialization(
      new Response(JSON.stringify({ ...SERIALIZED, actions: [] })),
    );

    await expect(serializeResources(appRoot)).rejects.toThrow(
      "The serialization response is missing action 51.",
    );
  });

  it("fails with the response when the serialization request fails", async () => {
    const appRoot = appWithDefinitions();
    mockSerialization(new Response("Unauthenticated", { status: 401 }));

    await expect(serializeResources(appRoot)).rejects.toThrow(
      "The serialization request failed (401): Unauthenticated",
    );
  });
});
