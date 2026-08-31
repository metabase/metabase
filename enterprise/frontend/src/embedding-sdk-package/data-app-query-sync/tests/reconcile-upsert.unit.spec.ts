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

describe("query reconciliation upserts", () => {
  setupResourceSyncTests();

  it("ignores fresh generated UUIDs when comparing saved questions", async () => {
    const appRoot = makeApp();
    const slug = path.basename(appRoot);
    writeQuery(
      appRoot,
      `export const Orders = defineQuery({ savedQuestionSourceId: 35, source: { type: "table", id: 1 } });`,
    );
    const [query] = await discoverQueries(appRoot);
    writeQueryLockfile(appRoot, [
      {
        tableId: query.tableId,
        hash: query.hash,
        savedQuestionSourceId: 35,
      },
    ]);
    const queryWithAggregationUuid = (uuid: string) => ({
      database: 1,
      stages: [
        {
          aggregation: [["sum", { "lib/uuid": uuid }, ["field", {}, 1]]],
          "order-by": [["desc", {}, ["aggregation", {}, uuid]]],
        },
      ],
    });
    const requests: Array<{ method: string; pathname: string }> = [];
    const log = jest.fn();
    jest.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const pathname = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      requests.push({ method, pathname });
      if (pathname === `/api/apps/${slug}/draft` && method === "POST") {
        return jsonResponse({ name: slug, resource_collection_id: 20 });
      }
      if (pathname === `/api/apps/${slug}/query` && method === "POST") {
        return jsonResponse({
          database_id: 1,
          dataset_query: queryWithAggregationUuid("fresh-uuid"),
          table_ids: [1],
        });
      }
      if (pathname === "/api/card/35" && method === "GET") {
        return jsonResponse({
          id: 35,
          name: "Orders",
          type: "question",
          collection_id: 20,
          dataset_query: queryWithAggregationUuid("saved-uuid"),
        });
      }
      if (pathname === "/api/card/35" && method === "PUT") {
        return jsonResponse({ id: 35 });
      }
      throw new Error(`Unexpected ${method} ${pathname}`);
    });

    await syncResources({
      appRoot,
      metabaseUrl: "http://metabase.test",
      apiKey: "secret",
      log,
    });

    expect(requests).not.toContainEqual({
      method: "PUT",
      pathname: "/api/card/35",
    });
    expect(log).toHaveBeenCalledWith("unchanged: card 35");
  });

  it("reports an exported query rename as an update", async () => {
    const appRoot = makeApp();
    const slug = path.basename(appRoot);
    writeQuery(
      appRoot,
      `export const RenamedOrders = defineQuery({ savedQuestionSourceId: 80, source: { type: "table", id: 1 } });`,
    );
    const [query] = await discoverQueries(appRoot);
    writeQueryLockfile(appRoot, [
      {
        tableId: query.tableId,
        hash: query.hash,
        savedQuestionSourceId: 80,
      },
    ]);
    const log = jest.fn();
    jest.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const pathname = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      if (pathname === `/api/apps/${slug}/draft` && method === "POST") {
        return jsonResponse({ name: slug, resource_collection_id: 20 });
      }
      if (pathname === `/api/apps/${slug}/query` && method === "POST") {
        return jsonResponse({
          database_id: 1,
          dataset_query: { database: 1 },
          table_ids: [1],
        });
      }
      if (pathname === "/api/card/80" && method === "GET") {
        return jsonResponse({
          id: 80,
          name: "Orders",
          type: "question",
          collection_id: 20,
          dataset_query: { database: 1 },
        });
      }
      if (pathname === "/api/card/80" && method === "PUT") {
        return jsonResponse({ id: 80 });
      }

      throw new Error(`Unexpected ${method} ${pathname}`);
    });

    await syncResources({
      appRoot,
      metabaseUrl: "http://metabase.test",
      apiKey: "secret",
      log,
    });

    expect(log).toHaveBeenCalledWith("updated: card 80");
  });
});
