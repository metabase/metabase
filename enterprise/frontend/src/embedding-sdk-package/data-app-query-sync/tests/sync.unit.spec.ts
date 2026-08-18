import fs from "node:fs";
import path from "node:path";

import { syncQueries } from "../sync";

import {
  isQuerySyncPermissionsRequest,
  jsonResponse,
  makeApp,
  setupQuerySyncTests,
  writeQuery,
} from "./setup";

describe("query synchronization", () => {
  setupQuerySyncTests();

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
      syncQueries({
        appRoot,
        metabaseUrl: "http://metabase.test",
        apiKey: "secret",
        log: jest.fn(),
      }),
    ).rejects.toThrow(
      `Metabase returned 404 for POST http://metabase.test/api/apps/${slug}/draft: Not found.`,
    );
  });

  it("identifies the query whose resolution failed", async () => {
    const appRoot = makeApp();
    const slug = path.basename(appRoot);
    writeQuery(
      appRoot,
      `export const MissingTable = defineQuery({ source: { type: "table", id: 999 } });`,
    );
    jest.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const pathname = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      if (pathname === `/api/apps/${slug}/draft` && method === "POST") {
        return jsonResponse({ name: slug, resource_collection_id: 20 });
      }
      if (pathname === `/api/apps/${slug}/query` && method === "POST") {
        return new Response("Not found.", { status: 404 });
      }
      throw new Error(`Unexpected ${method} ${pathname}`);
    });

    await expect(
      syncQueries({
        appRoot,
        metabaseUrl: "http://metabase.test",
        apiKey: "secret",
        log: jest.fn(),
      }),
    ).rejects.toThrow(
      "Could not resolve queries/orders.query.ts:MissingTable: Metabase returned 404",
    );
  });

  it("prepares an unpublished app and reconciles an empty database set", async () => {
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
        return jsonResponse({
          name: slug,
          resource_collection_id: 20,
        });
      }
      if (
        pathname === `/api/apps/${slug}/query-sync/permissions` &&
        method === "PUT"
      ) {
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

    expect(requests).toEqual([
      {
        method: "POST",
        pathname: `/api/apps/${slug}/draft`,
        body: undefined,
      },
      {
        method: "PUT",
        pathname: `/api/apps/${slug}/query-sync/permissions`,
        body: JSON.stringify({ database_ids: [] }),
      },
    ]);
    expect(
      fs.readFileSync(path.join(appRoot, "data_app.yaml"), "utf8"),
    ).toContain("resource_collection_entity_id: resourcecollectionid1");
    expect(
      fs.readFileSync(path.join(appRoot, "data_app.yaml"), "utf8"),
    ).toContain("permission_group_entity_id: permissiongroupid0001");
  });

  it("reconciles the complete set of resolved query databases", async () => {
    const appRoot = makeApp();
    const slug = path.basename(appRoot);
    writeQuery(
      appRoot,
      `export const First = defineQuery({ source: { type: "table", id: 1 } });
       export const Second = defineQuery({ source: { type: "table", id: 2 } });`,
    );
    let nextCardId = 30;
    const permissionBodies: unknown[] = [];
    jest.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const pathname = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      if (pathname === `/api/apps/${slug}/draft` && method === "POST") {
        return jsonResponse({ name: slug, resource_collection_id: 20 });
      }
      if (pathname === `/api/apps/${slug}/query` && method === "POST") {
        const body = JSON.parse(String(init?.body));
        const tableId = body.stages[0].source.id;
        const databaseId = tableId === 1 ? 20 : 10;
        return jsonResponse({
          database_id: databaseId,
          dataset_query: { database: databaseId },
        });
      }
      if (pathname === "/api/card" && method === "POST") {
        return jsonResponse({ id: nextCardId++ });
      }

      if (isQuerySyncPermissionsRequest(pathname, method, slug)) {
        permissionBodies.push(JSON.parse(String(init?.body)));
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

    expect(permissionBodies).toEqual([{ database_ids: [10, 20] }]);
  });
});
