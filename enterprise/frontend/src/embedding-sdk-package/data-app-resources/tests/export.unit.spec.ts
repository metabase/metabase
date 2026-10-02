import fs from "node:fs";
import path from "node:path";

import { exportResources } from "../export";

import { makeApp, setupResourceTests, writeAction, writeQuery } from "./setup";

const QUESTION = "questionEntityId00010";
const ACTION_COPY = "actionCopyEntityId001";
const MODEL = "modelEntityId00000001";

const EXPORTED = {
  queries: [
    {
      export: "Orders",
      dataset_query: { database: "Sample Database" },
      metrics: [],
    },
  ],
  actions: [
    { id: 51, entity: { entity_id: "sourceActionEntity051", model_id: MODEL } },
  ],
  models: [{ id: 7, entity: { entity_id: MODEL } }],
  metrics: [],
};

function appWithDefinitions() {
  const appRoot = makeApp();
  fs.writeFileSync(
    path.join(appRoot, ".env.local"),
    "DATA_APP_MB_URL=http://metabase.test/\nDATA_APP_MB_API_KEY=mb_test_key\n",
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

function mockExport(response: Response) {
  return jest.spyOn(global, "fetch").mockResolvedValue(response);
}

describe("exporting what resources are written from", () => {
  setupResourceTests();

  it("sends the definitions and action IDs in one request, and prints the export with each definition's IDs", async () => {
    const appRoot = appWithDefinitions();
    const fetchSpy = mockExport(new Response(JSON.stringify(EXPORTED)));

    const printed = JSON.parse(await exportResources(appRoot));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("http://metabase.test/api/apps/export-resources");
    expect(init?.headers).toEqual({
      "Content-Type": "application/json",
      "X-API-Key": "mb_test_key",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      queries: [
        {
          export: "Orders",
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
          dataset_query: { database: "Sample Database" },
          metrics: [],
        },
      ],
      actions: [
        {
          export: "Create",
          file: "actions/orders.action.ts",
          copiedActionEntityId: ACTION_COPY,
          id: 51,
          entity: { entity_id: "sourceActionEntity051", model_id: MODEL },
        },
      ],
      models: EXPORTED.models,
      metrics: [],
    });
  });

  it("sends only the definitions in the given file", async () => {
    const appRoot = appWithDefinitions();
    const fetchSpy = mockExport(
      new Response(JSON.stringify({ ...EXPORTED, actions: [], models: [] })),
    );

    await exportResources(appRoot, "queries/orders.query.ts");

    expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))).toEqual({
      queries: [expect.objectContaining({ export: "Orders" })],
      actions: [],
    });
  });

  it("fails for a file with no definitions", async () => {
    const appRoot = appWithDefinitions();

    await expect(exportResources(appRoot, "src/App.tsx")).rejects.toThrow(
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
      await expect(exportResources(appRoot)).rejects.toThrow(
        "DATA_APP_MB_URL and DATA_APP_MB_API_KEY must be set in .env.local.",
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
    mockExport(new Response(JSON.stringify({ ...EXPORTED, queries: [] })));

    await expect(exportResources(appRoot)).rejects.toThrow(
      "The export response has an unexpected body.",
    );
  });

  it("fails with the response when the export request fails", async () => {
    const appRoot = appWithDefinitions();
    mockExport(new Response("Unauthenticated", { status: 401 }));

    await expect(exportResources(appRoot)).rejects.toThrow(
      "The export request failed (401): Unauthenticated",
    );
  });
});
