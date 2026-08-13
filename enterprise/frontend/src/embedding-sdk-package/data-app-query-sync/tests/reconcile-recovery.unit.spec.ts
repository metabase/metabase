import fs from "node:fs";
import path from "node:path";

import { discoverQueries } from "../discover";
import { syncResources } from "../sync";

import {
  FAKE_HASH,
  isResourcePermissionsRequest,
  jsonResponse,
  makeApp,
  seedQueries,
  setupResourceSyncTests,
  writeQuery,
} from "./setup";

describe("query reconciliation recovery", () => {
  setupResourceSyncTests();

  it("deletes only lockfile-proven questions in the bound collection", async () => {
    const appRoot = makeApp();
    const slug = path.basename(appRoot);
    seedQueries(appRoot, [
      {
        tableId: 1,
        hash: FAKE_HASH,
        savedQuestionSourceId: 40,
      },
    ]);
    const requests: Array<{ method: string; pathname: string }> = [];
    jest.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const pathname = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      requests.push({ method, pathname });
      if (pathname === `/api/apps/${slug}/draft` && method === "POST") {
        return jsonResponse({ name: slug, resource_collection_id: 20 });
      }
      if (pathname === "/api/card/40" && method === "GET") {
        return jsonResponse({
          id: 40,
          name: "Removed",
          type: "question",
          collection_id: 20,
          dataset_query: {},
        });
      }
      if (pathname === "/api/card/40" && method === "DELETE") {
        return jsonResponse(null, 204);
      }

      if (isResourcePermissionsRequest(pathname, method, slug)) {
        return jsonResponse({ name: slug, resource_collection_id: 20 });
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
      method: "DELETE",
      pathname: "/api/card/40",
    });
    expect(
      JSON.parse(
        fs.readFileSync(path.join(appRoot, "resources_metadata.json"), "utf8"),
      ),
    ).toEqual({ queries: [], models: [] });
  });

  it("recreates a lockfile-proven question only after a confirmed 404", async () => {
    const appRoot = makeApp();
    const slug = path.basename(appRoot);
    const filePath = writeQuery(
      appRoot,
      `export const Orders = defineQuery({ savedQuestionSourceId: 50, source: { type: "table", id: 1 } });`,
    );
    const [query] = await discoverQueries(appRoot);
    seedQueries(appRoot, [
      {
        tableId: query.tableId,
        hash: query.hash,
        savedQuestionSourceId: 50,
      },
    ]);
    jest.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const pathname = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      if (pathname === `/api/apps/${slug}/draft` && method === "POST") {
        return jsonResponse({ name: slug, resource_collection_id: 20 });
      }
      if (pathname === `/api/apps/${slug}/query`) {
        return jsonResponse({ database_id: 1, dataset_query: { database: 1 } });
      }
      if (pathname === "/api/card/50" && method === "GET") {
        return jsonResponse({ message: "Not found" }, 404);
      }
      if (pathname === "/api/card" && method === "POST") {
        return jsonResponse({ id: 51 });
      }

      if (isResourcePermissionsRequest(pathname, method, slug)) {
        return jsonResponse({ name: slug, resource_collection_id: 20 });
      }
      throw new Error(`Unexpected ${method} ${pathname}`);
    });

    await syncResources({
      appRoot,
      metabaseUrl: "http://metabase.test",
      apiKey: "secret",
      log: jest.fn(),
    });

    expect(fs.readFileSync(filePath, "utf8")).toContain(
      "savedQuestionSourceId: 51",
    );
    expect(
      JSON.parse(
        fs.readFileSync(path.join(appRoot, "resources_metadata.json"), "utf8"),
      ),
    ).toEqual({
      queries: [
        {
          tableId: 1,
          hash: query.hash,
          savedQuestionSourceId: 51,
        },
      ],
      models: [],
    });
  });

  it("restores a missing inline ID from an unambiguous lockfile entry", async () => {
    const appRoot = makeApp();
    const slug = path.basename(appRoot);
    const filePath = writeQuery(
      appRoot,
      `export const Orders = defineQuery({ source: { type: "table", id: 1 } });`,
    );
    const [query] = await discoverQueries(appRoot);
    seedQueries(appRoot, [
      {
        tableId: query.tableId,
        hash: query.hash,
        savedQuestionSourceId: 55,
      },
    ]);
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
        return jsonResponse({ database_id: 1, dataset_query: { database: 1 } });
      }
      if (pathname === "/api/card/55" && method === "GET") {
        return jsonResponse({
          id: 55,
          name: "Orders",
          type: "question",
          collection_id: 20,
          dataset_query: { database: 1 },
        });
      }

      if (isResourcePermissionsRequest(pathname, method, slug)) {
        return jsonResponse({ name: slug, resource_collection_id: 20 });
      }
      throw new Error(`Unexpected ${method} ${pathname}`);
    });

    await syncResources({
      appRoot,
      metabaseUrl: "http://metabase.test",
      apiKey: "secret",
      log,
    });

    expect(fs.readFileSync(filePath, "utf8")).toContain(
      "savedQuestionSourceId: 55",
    );
    expect(
      requests.some(
        ({ method, pathname }) => method === "POST" && pathname === "/api/card",
      ),
    ).toBe(false);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("restored source ID: Orders -> card 55");
  });

  it("explains how to recover a removed query whose card moved", async () => {
    const appRoot = makeApp();
    const slug = path.basename(appRoot);
    seedQueries(appRoot, [
      {
        tableId: 1,
        hash: FAKE_HASH,
        savedQuestionSourceId: 90,
      },
    ]);
    jest.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const pathname = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      if (pathname === `/api/apps/${slug}/draft` && method === "POST") {
        return jsonResponse({ name: slug, resource_collection_id: 20 });
      }
      if (pathname === "/api/card/90" && method === "GET") {
        return jsonResponse({
          id: 90,
          name: "Removed",
          type: "question",
          collection_id: 99,
          dataset_query: {},
        });
      }
      throw new Error(`Unexpected ${method} ${pathname}`);
    });

    await expect(
      syncResources({
        appRoot,
        metabaseUrl: "http://metabase.test",
        apiKey: "secret",
        log: jest.fn(),
      }),
    ).rejects.toThrow(
      "Move card 90 back to data app collection 20 or delete it manually, then run sync-resources again.",
    );
  });
});
