import fs from "node:fs";
import path from "node:path";

import { exportNameToCardName, writeResources } from "../serialize";

import {
  COLLECTION,
  makeApp,
  setupResourceTests,
  writeAction,
  writeQuery,
} from "./setup";

const QUESTION = "questionEntityId00010";
const ACTION_COPY = "actionCopyEntityId001";

const QUESTION_PATH =
  "collections/data_apps/appCollectionEntity01_shop/cards/questionEntityId00010_orders.yaml";
const ACTION_PATH =
  "collections/data_apps/appCollectionEntity01_shop/actions/actionCopyEntityId001_create.yaml";
const METRIC_PATH =
  "collections/data_apps/appCollectionEntity01_shop/cards/metricCopyEntityId0001_revenue.yaml";

const SERIALIZED = {
  queries: [{ path: QUESTION_PATH, yaml: "name: Orders\n" }],
  actions: [{ path: ACTION_PATH, yaml: "name: Create\n" }],
  metrics: [{ path: METRIC_PATH, yaml: "name: Revenue\n" }],
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

  it("refuses to write before the manifest names the app's collection", async () => {
    const appRoot = appWithDefinitions();
    fs.writeFileSync(
      path.join(appRoot, "data_app.yaml"),
      "name: Orders\npath: ./dist/index.js\n",
    );
    const fetchSpy = mockSerialization(
      new Response(JSON.stringify(SERIALIZED)),
    );

    await expect(writeResources(appRoot)).rejects.toThrow(
      "names the app's collection",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses to write a query that has no saved question ID yet", async () => {
    const appRoot = appWithDefinitions();
    fs.appendFileSync(
      path.join(appRoot, "queries/orders.query.ts"),
      `export const Products = defineQuery({ source: { type: "table", id: 2 } });\n`,
    );
    const fetchSpy = mockSerialization(
      new Response(JSON.stringify(SERIALIZED)),
    );

    await expect(writeResources(appRoot)).rejects.toThrow(
      "queries/orders.query.ts:Products has no savedQuestionEntityId.",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses to write an action that has no copied action ID yet", async () => {
    const appRoot = appWithDefinitions();
    writeAction(
      appRoot,
      `export const Create = defineAction({ action: { id: 51, parameters: [] } });`,
    );
    const fetchSpy = mockSerialization(
      new Response(JSON.stringify(SERIALIZED)),
    );

    await expect(writeResources(appRoot)).rejects.toThrow(
      "actions/orders.action.ts:Create has no copiedActionEntityId.",
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sends the definitions with their IDs and the app's collection in one request, and writes every returned file at its path", async () => {
    const appRoot = appWithDefinitions();
    const fetchSpy = mockSerialization(
      new Response(JSON.stringify(SERIALIZED)),
    );

    const output = await writeResources(appRoot);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("http://metabase.test/api/apps/serialize");
    expect(init?.headers).toEqual({
      "Content-Type": "application/json",
      "X-API-Key": "mb_test_key",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      queries: [
        {
          name: "Orders",
          query: { stages: [{ source: { type: "table", id: 1 }, limit: 5 }] },
          entity_id: QUESTION,
          collection_id: COLLECTION,
        },
      ],
      actions: [
        { action_id: 51, entity_id: ACTION_COPY, collection_id: COLLECTION },
      ],
    });
    expect(output).toBe(
      [QUESTION_PATH, ACTION_PATH, METRIC_PATH]
        .map((written) => `Wrote ${written}`)
        .join("\n"),
    );
    expect(fs.readFileSync(path.join(appRoot, QUESTION_PATH), "utf8")).toBe(
      "name: Orders\n",
    );
    expect(fs.readFileSync(path.join(appRoot, ACTION_PATH), "utf8")).toBe(
      "name: Create\n",
    );
    expect(fs.readFileSync(path.join(appRoot, METRIC_PATH), "utf8")).toBe(
      "name: Revenue\n",
    );
  });

  it("writes into the repository above an app under data_apps/", async () => {
    const appRoot = makeApp({ underDataApps: true });
    fs.writeFileSync(
      path.join(appRoot, ".env.local"),
      "DATA_APP_MB_URL=http://metabase.test/\nDATA_APP_MB_API_KEY=mb_test_key\n",
    );
    writeQuery(
      appRoot,
      `export const Orders = defineQuery({ savedQuestionEntityId: "${QUESTION}", source: { type: "table", id: 1 } });`,
    );
    mockSerialization(
      new Response(JSON.stringify({ ...SERIALIZED, actions: [], metrics: [] })),
    );

    await writeResources(appRoot);

    expect(fs.existsSync(path.join(appRoot, "..", "..", QUESTION_PATH))).toBe(
      true,
    );
  });

  it("sends only the definitions in the given file", async () => {
    const appRoot = appWithDefinitions();
    const fetchSpy = mockSerialization(
      new Response(JSON.stringify({ ...SERIALIZED, actions: [] })),
    );

    await writeResources(appRoot, "queries/orders.query.ts");

    expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))).toEqual({
      queries: [expect.objectContaining({ name: "Orders" })],
      actions: [],
    });
  });

  it("refuses a file outside collections/data_apps/ and writes nothing", async () => {
    const appRoot = appWithDefinitions();
    mockSerialization(
      new Response(
        JSON.stringify({
          queries: [{ path: "../escaped.yaml", yaml: "name: Orders\n" }],
          actions: [],
          metrics: [],
        }),
      ),
    );
    fs.rmSync(path.join(appRoot, "actions/orders.action.ts"));

    await expect(writeResources(appRoot)).rejects.toThrow(
      "The serialization holds a file outside collections/data_apps/: ../escaped.yaml",
    );
    expect(fs.existsSync(path.join(appRoot, "..", "escaped.yaml"))).toBe(false);
  });

  it("writes the other files, then throws every per-item error", async () => {
    const appRoot = appWithDefinitions();
    mockSerialization(
      new Response(
        JSON.stringify({
          queries: [{ error: "Unknown database" }],
          actions: [{ path: ACTION_PATH, yaml: "name: Create\n" }],
          metrics: [{ path: METRIC_PATH, yaml: "name: Revenue\n" }],
        }),
      ),
    );

    await expect(writeResources(appRoot)).rejects.toThrow(
      [
        `Wrote ${ACTION_PATH}`,
        `Wrote ${METRIC_PATH}`,
        "queries/orders.query.ts:Orders: Unknown database",
      ].join("\n"),
    );
    expect(fs.existsSync(path.join(appRoot, ACTION_PATH))).toBe(true);
    expect(fs.existsSync(path.join(appRoot, METRIC_PATH))).toBe(true);
    expect(fs.existsSync(path.join(appRoot, QUESTION_PATH))).toBe(false);
  });

  it("fails for a file with no definitions", async () => {
    const appRoot = appWithDefinitions();

    await expect(writeResources(appRoot, "src/App.tsx")).rejects.toThrow(
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
      await expect(writeResources(appRoot)).rejects.toThrow(
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

  it("fails when the response doesn't answer every definition", async () => {
    const appRoot = appWithDefinitions();
    mockSerialization(
      new Response(JSON.stringify({ ...SERIALIZED, queries: [] })),
    );

    await expect(writeResources(appRoot)).rejects.toThrow(
      "The serialization response doesn't answer every definition.",
    );
  });

  it("fails with the response when the serialization request fails", async () => {
    const appRoot = appWithDefinitions();
    mockSerialization(new Response("Unauthenticated", { status: 401 }));

    await expect(writeResources(appRoot)).rejects.toThrow(
      "The serialization request failed (401): Unauthenticated",
    );
  });

  it("turns an export name into a card name", () => {
    expect(exportNameToCardName("OrdersByMonth")).toBe("Orders by month");
    expect(exportNameToCardName("monthly_revenue")).toBe("Monthly revenue");
  });
});
