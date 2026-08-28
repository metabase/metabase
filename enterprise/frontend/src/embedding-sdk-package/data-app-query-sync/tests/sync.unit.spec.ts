import path from "node:path";

import { syncResources } from "../sync";

import { jsonResponse, makeApp, setupResourceSyncTests } from "./setup";

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

  it("prepares an unpublished app and reconciles an empty table set", async () => {
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
        pathname === `/api/apps/${slug}/resources/permissions` &&
        method === "PUT"
      ) {
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

    expect(requests).toEqual([
      {
        method: "POST",
        pathname: `/api/apps/${slug}/draft`,
        body: undefined,
      },
      {
        method: "PUT",
        pathname: `/api/apps/${slug}/resources/permissions`,
        body: JSON.stringify({ table_ids: [] }),
      },
    ]);
  });
});
