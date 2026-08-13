import fs from "node:fs";
import path from "node:path";

import { discoverQueries } from "../discover";
import { checkQuerySync, syncQueries } from "../sync";

import {
  isQuerySyncPermissionsRequest,
  jsonResponse,
  makeApp,
  setupQuerySyncTests,
  writeQuery,
} from "./setup";

describe("query reconciliation upserts", () => {
  setupQuerySyncTests();

  it("creates source-first state and is unchanged on repeated sync", async () => {
    const appRoot = makeApp();
    const slug = path.basename(appRoot);
    const filePath = writeQuery(
      appRoot,
      `export const Orders = defineQuery({ source: { type: "table", id: 1 }, limit: 5 });`,
    );
    const requests: Array<{ method: string; pathname: string }> = [];
    jest.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const pathname = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      requests.push({ method, pathname });
      if (pathname === `/api/apps/${slug}/query`) {
        return jsonResponse({
          database_id: 1,
          dataset_query: { database: 1, stages: [{ "source-table": 1 }] },
        });
      }
      if (pathname === `/api/apps/${slug}/draft` && method === "POST") {
        return jsonResponse({
          name: slug,
          resource_collection_id: 20,
        });
      }
      if (pathname === "/api/card" && method === "POST") {
        return jsonResponse({ id: 30 });
      }
      if (pathname === "/api/card/30") {
        return jsonResponse({
          id: 30,
          name: "Orders",
          type: "question",
          collection_id: 20,
          dataset_query: { database: 1, stages: [{ "source-table": 1 }] },
        });
      }

      if (isQuerySyncPermissionsRequest(pathname, method, slug)) {
        return jsonResponse({ name: slug, resource_collection_id: 20 });
      }
      throw new Error(`Unexpected ${method} ${pathname}`);
    });
    await syncQueries({
      appRoot,
      metabaseUrl: "http://metabase.test",
      apiKey: "secret",
      log: jest.fn(),
    });
    expect(fs.readFileSync(filePath, "utf8")).toContain(
      "savedQuestionSourceId: 30",
    );
    await checkQuerySync(appRoot);
    await syncQueries({
      appRoot,
      metabaseUrl: "http://metabase.test",
      apiKey: "secret",
      log: jest.fn(),
    });
    expect(
      requests.filter(
        ({ method, pathname }) => method === "POST" && pathname === "/api/card",
      ),
    ).toHaveLength(1);
    expect(
      requests.filter(
        ({ method, pathname }) =>
          method === "PUT" &&
          pathname === `/api/apps/${slug}/query-sync/permissions`,
      ),
    ).toHaveLength(2);
    expect(
      requests.some(
        ({ method, pathname }) =>
          method === "PUT" &&
          pathname !== `/api/apps/${slug}/query-sync/permissions`,
      ),
    ).toBe(false);
  });

  it("ignores fresh generated UUIDs when comparing saved questions", async () => {
    const appRoot = makeApp();
    const slug = path.basename(appRoot);
    writeQuery(
      appRoot,
      `export const Orders = defineQuery({ savedQuestionSourceId: 35, source: { type: "table", id: 1 } });`,
    );
    const [query] = await discoverQueries(appRoot);
    fs.writeFileSync(
      path.join(appRoot, "queries_metadata.json"),
      JSON.stringify([
        {
          tableId: query.tableId,
          hash: query.hash,
          savedQuestionSourceId: 35,
        },
      ]),
    );
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
      if (isQuerySyncPermissionsRequest(pathname, method, slug)) {
        return jsonResponse({ name: slug, resource_collection_id: 20 });
      }
      throw new Error(`Unexpected ${method} ${pathname}`);
    });

    await syncQueries({
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

  it("restores authoritative Card properties without replacing its ID", async () => {
    const appRoot = makeApp();
    const slug = path.basename(appRoot);
    writeQuery(
      appRoot,
      `export const Orders = defineQuery({ savedQuestionSourceId: 60, source: { type: "table", id: 1 } });`,
    );
    const [query] = await discoverQueries(appRoot);
    fs.writeFileSync(
      path.join(appRoot, "queries_metadata.json"),
      JSON.stringify([
        {
          tableId: query.tableId,
          hash: query.hash,
          savedQuestionSourceId: 60,
        },
      ]),
    );
    const requests: Array<{ method: string; pathname: string }> = [];
    jest.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const pathname = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      requests.push({ method, pathname });
      if (pathname === `/api/apps/${slug}/draft` && method === "POST") {
        return jsonResponse({ name: slug, resource_collection_id: 20 });
      }
      if (pathname === `/api/apps/${slug}/query`) {
        return jsonResponse({
          database_id: 1,
          dataset_query: { database: 1, stages: [] },
        });
      }
      if (pathname === "/api/card/60" && method === "GET") {
        return jsonResponse({
          id: 60,
          name: "Manually changed",
          type: "question",
          collection_id: 99,
          dataset_query: { database: 2 },
        });
      }
      if (pathname === "/api/card/60" && method === "PUT") {
        return jsonResponse({ id: 60 });
      }

      if (isQuerySyncPermissionsRequest(pathname, method, slug)) {
        return jsonResponse({ name: slug, resource_collection_id: 20 });
      }
      throw new Error(`Unexpected ${method} ${pathname}`);
    });

    await syncQueries({
      appRoot,
      metabaseUrl: "http://metabase.test",
      apiKey: "secret",
      log: jest.fn(),
    });

    expect(requests).toContainEqual({
      method: "PUT",
      pathname: "/api/card/60",
    });
    expect(
      fs.readFileSync(path.join(appRoot, "queries/orders.query.ts"), "utf8"),
    ).toContain("savedQuestionSourceId: 60");
  });

  it("repairs a missing lockfile checkpoint from an owned inline Card ID", async () => {
    const appRoot = makeApp();
    const slug = path.basename(appRoot);
    writeQuery(
      appRoot,
      `export const Orders = defineQuery({ savedQuestionSourceId: 70, source: { type: "table", id: 1 } });`,
    );
    const [query] = await discoverQueries(appRoot);
    const log = jest.fn();
    jest.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const pathname = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      if (pathname === `/api/apps/${slug}/draft` && method === "POST") {
        return jsonResponse({ name: slug, resource_collection_id: 20 });
      }
      if (pathname === `/api/apps/${slug}/query`) {
        return jsonResponse({ database_id: 1, dataset_query: { database: 1 } });
      }
      if (pathname === "/api/card/70" && method === "GET") {
        return jsonResponse({
          id: 70,
          name: "Orders",
          type: "question",
          collection_id: 20,
          dataset_query: { database: 1 },
        });
      }

      if (isQuerySyncPermissionsRequest(pathname, method, slug)) {
        return jsonResponse({ name: slug, resource_collection_id: 20 });
      }
      throw new Error(`Unexpected ${method} ${pathname}`);
    });

    await syncQueries({
      appRoot,
      metabaseUrl: "http://metabase.test",
      apiKey: "secret",
      log,
    });

    expect(
      JSON.parse(
        fs.readFileSync(path.join(appRoot, "queries_metadata.json"), "utf8"),
      ),
    ).toEqual([
      {
        tableId: 1,
        hash: query.hash,
        savedQuestionSourceId: 70,
      },
    ]);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith("repaired lockfile: Orders -> card 70");
  });

  it("reports an exported query rename as an update", async () => {
    const appRoot = makeApp();
    const slug = path.basename(appRoot);
    writeQuery(
      appRoot,
      `export const RenamedOrders = defineQuery({ savedQuestionSourceId: 80, source: { type: "table", id: 1 } });`,
    );
    const [query] = await discoverQueries(appRoot);
    fs.writeFileSync(
      path.join(appRoot, "queries_metadata.json"),
      JSON.stringify([
        {
          tableId: query.tableId,
          hash: query.hash,
          savedQuestionSourceId: 80,
        },
      ]),
    );
    const log = jest.fn();
    jest.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const pathname = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      if (pathname === `/api/apps/${slug}/draft` && method === "POST") {
        return jsonResponse({ name: slug, resource_collection_id: 20 });
      }
      if (pathname === `/api/apps/${slug}/query` && method === "POST") {
        return jsonResponse({ database_id: 1, dataset_query: { database: 1 } });
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

      if (isQuerySyncPermissionsRequest(pathname, method, slug)) {
        return jsonResponse({ name: slug, resource_collection_id: 20 });
      }
      throw new Error(`Unexpected ${method} ${pathname}`);
    });

    await syncQueries({
      appRoot,
      metabaseUrl: "http://metabase.test",
      apiKey: "secret",
      log,
    });

    expect(log).toHaveBeenCalledWith("updated: card 80");
  });
});
