import path from "node:path";

import { discoverQueries } from "../discover";
import { syncResources } from "../sync";

import {
  jsonResponse,
  makeApp,
  setupResourceSyncTests,
  writeQuery,
  writeQueryLockfile,
} from "./setup";

describe("query synchronization", () => {
  setupResourceSyncTests();

  it("identifies the request that failed", async () => {
    const appRoot = makeApp();
    const slug = path.basename(appRoot);
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response("Not found.", {
        status: 404,
        headers: { "content-type": "text/plain" },
      }),
    );

    await expect(
      syncResources({
        appRoot,
        metabaseUrl: "http://metabase.test",
        apiKey: "secret",
        log: jest.fn(),
      }),
    ).rejects.toThrow(
      `Metabase returned 404 for POST http://metabase.test/api/apps/${slug}/draft: Not found.`,
    );
  });

  it("stores an empty dependency set after synchronizing an empty app", async () => {
    const appRoot = makeApp();
    const slug = path.basename(appRoot);
    const requests: Array<{
      method: string;
      pathname: string;
      body?: string;
    }> = [];

    jest.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const pathname = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      requests.push({ method, pathname, body: init?.body?.toString() });

      if (pathname === `/api/apps/${slug}/draft` && method === "POST") {
        return jsonResponse({ name: slug, resource_collection_id: 20 });
      }
      if (
        pathname === `/api/apps/${slug}/table-dependencies` &&
        method === "PUT"
      ) {
        return jsonResponse({ name: slug, table_ids: [] });
      }

      throw new Error(`Unexpected ${method} ${pathname}`);
    });

    await syncResources({
      appRoot,
      metabaseUrl: "http://metabase.test",
      apiKey: "secret",
      log: jest.fn(),
    });

    expect(requests.at(-1)).toEqual({
      method: "PUT",
      pathname: `/api/apps/${slug}/table-dependencies`,
      body: JSON.stringify({ table_ids: [] }),
    });
  });

  it("stores the tables a copied metric reaches through a foreign key", async () => {
    const appRoot = makeApp();
    const slug = path.basename(appRoot);
    writeQuery(
      appRoot,
      `export const Orders = defineQuery({ savedQuestionSourceId: 35, source: { type: "table", id: 1 } });`,
    );
    const [query] = await discoverQueries(appRoot);
    writeQueryLockfile(appRoot, [
      { tableId: query.tableId, hash: query.hash, savedQuestionSourceId: 35 },
    ]);

    // Sources table 1 and groups by a table 2 column reached through a foreign
    // key, so 2 appears nowhere in the query and only the server can report it.
    const metricQuery = { database: 1, stages: [{ "source-table": 1 }] };
    const requests: Array<{
      method: string;
      pathname: string;
      body?: string;
    }> = [];

    jest.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const pathname = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      requests.push({ method, pathname, body: init?.body?.toString() });

      if (pathname === `/api/apps/${slug}/draft` && method === "POST") {
        return jsonResponse({ name: slug, resource_collection_id: 20 });
      }
      if (pathname === `/api/apps/${slug}/query` && method === "POST") {
        return jsonResponse({
          database_id: 1,
          dataset_query: { database: 1 },
          table_ids: [1],
          metrics: [
            {
              id: 251,
              name: "Revenue",
              type: "metric",
              collection_id: 1,
              dataset_query: metricQuery,
              database_id: 1,
              display: "table",
              visualization_settings: {},
              description: null,
            },
          ],
        });
      }
      if (pathname === "/api/card" && method === "POST") {
        return jsonResponse({ id: 404 });
      }
      if (pathname === "/api/card/35" && method === "GET") {
        return jsonResponse({
          id: 35,
          name: "Orders",
          type: "question",
          collection_id: 20,
          dataset_query: { database: 1 },
        });
      }
      if (
        pathname === `/api/apps/${slug}/query-table-dependencies` &&
        method === "POST"
      ) {
        return jsonResponse({ table_ids: [1, 2] });
      }
      if (
        pathname === `/api/apps/${slug}/table-dependencies` &&
        method === "PUT"
      ) {
        return jsonResponse({ name: slug, table_ids: [1, 2] });
      }

      throw new Error(`Unexpected ${method} ${pathname}`);
    });

    await syncResources({
      appRoot,
      metabaseUrl: "http://metabase.test",
      apiKey: "secret",
      log: jest.fn(),
    });

    expect(requests).toContainEqual({
      method: "POST",
      pathname: `/api/apps/${slug}/query-table-dependencies`,
      body: JSON.stringify({ dataset_queries: [metricQuery] }),
    });
    expect(requests.at(-1)).toEqual({
      method: "PUT",
      pathname: `/api/apps/${slug}/table-dependencies`,
      body: JSON.stringify({ table_ids: [1, 2] }),
    });
  });
});
