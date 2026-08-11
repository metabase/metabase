import fs from "node:fs";
import path from "node:path";

import { syncQueries } from "../sync";

import { jsonResponse, makeApp, writeQuery } from "./setup";

describe("data app query synchronization", () => {
  afterEach(() => jest.restoreAllMocks());

  it("creates, updates, renames, and then leaves a saved question unchanged", async () => {
    const appRoot = makeApp();
    const slug = path.basename(appRoot);

    const queryPath = writeQuery(
      appRoot,
      `export const Orders = defineQuery({ source: { type: "table", id: 1 }, limit: 5 });`,
    );

    let card: Record<string, unknown> | undefined;
    let nextCardId = 10;

    const requests: Array<{ method: string; pathname: string }> = [];
    const permissionBodies: unknown[] = [];

    jest.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const pathname = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;

      requests.push({ method, pathname });

      if (method === "POST" && pathname === `/api/apps/${slug}/draft`) {
        return jsonResponse({ name: slug, resource_collection_id: 20 });
      }

      if (method === "POST" && pathname === `/api/apps/${slug}/query`) {
        return jsonResponse({
          database_id: 1,
          dataset_query: {
            database: 1,
            stages: [{ limit: body.stages[0].limit }],
          },
        });
      }

      if (
        method === "PUT" &&
        pathname === `/api/apps/${slug}/query-sync/permissions`
      ) {
        permissionBodies.push(body);

        return jsonResponse({ name: slug, resource_collection_id: 20 });
      }

      if (method === "POST" && pathname === "/api/card") {
        card = {
          id: nextCardId++,
          name: body.name,
          type: "question",
          collection_id: body.collection_id,
          dataset_query: body.dataset_query,
        };

        return jsonResponse(card);
      }

      if (method === "GET" && pathname === "/api/card/10") {
        return jsonResponse(card);
      }

      if (method === "PUT" && pathname === "/api/card/10") {
        card = { ...card, name: body.name, dataset_query: body.dataset_query };

        return jsonResponse(card);
      }

      throw new Error(`Unexpected ${method} ${pathname}`);
    });

    await syncQueries({
      appRoot,
      metabaseUrl: "http://metabase.test",
      apiKey: "secret",
    });

    expect(fs.readFileSync(queryPath, "utf8")).toContain(
      "savedQuestionSourceId: 10",
    );

    expect(
      JSON.parse(
        fs.readFileSync(path.join(appRoot, "queries_metadata.json"), "utf8"),
      ),
    ).toEqual([
      expect.objectContaining({ savedQuestionSourceId: 10, tableId: 1 }),
    ]);

    fs.writeFileSync(
      queryPath,
      fs
        .readFileSync(queryPath, "utf8")
        .replace("Orders", "RecentOrders")
        .replace("limit: 5", "limit: 6"),
    );

    await syncQueries({
      appRoot,
      metabaseUrl: "http://metabase.test",
      apiKey: "secret",
    });

    expect(card).toEqual(
      expect.objectContaining({
        name: "RecentOrders",
        dataset_query: { database: 1, stages: [{ limit: 6 }] },
      }),
    );

    requests.length = 0;

    await syncQueries({
      appRoot,
      metabaseUrl: "http://metabase.test",
      apiKey: "secret",
    });

    expect(requests).not.toContainEqual({
      method: "PUT",
      pathname: "/api/card/10",
    });

    expect(permissionBodies).toEqual([
      { database_ids: [1] },
      { database_ids: [1] },
      { database_ids: [1] },
    ]);
  });

  it("preserves ownership state for removed queries", async () => {
    const appRoot = makeApp();
    const slug = path.basename(appRoot);
    const lockfilePath = path.join(appRoot, "queries_metadata.json");

    const previousEntries = [
      {
        tableId: 1,
        hash: `v1:sha256:${"0".repeat(64)}`,
        savedQuestionSourceId: 10,
      },
    ];

    fs.writeFileSync(lockfilePath, JSON.stringify(previousEntries));

    const permissionBodies: unknown[] = [];

    jest.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const pathname = new URL(String(input)).pathname;

      if (pathname === `/api/apps/${slug}/draft`) {
        return jsonResponse({ name: slug, resource_collection_id: 20 });
      }

      if (pathname === `/api/apps/${slug}/query-sync/permissions`) {
        permissionBodies.push(JSON.parse(String(init?.body)));
        return jsonResponse({ name: slug, resource_collection_id: 20 });
      }

      throw new Error(`Unexpected request to ${pathname}`);
    });

    await syncQueries({
      appRoot,
      metabaseUrl: "http://metabase.test",
      apiKey: "secret",
    });

    expect(JSON.parse(fs.readFileSync(lockfilePath, "utf8"))).toEqual(
      previousEntries,
    );

    expect(permissionBodies).toEqual([{ database_ids: [] }]);
  });
});
