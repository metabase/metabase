import fs from "node:fs";
import path from "node:path";

import { syncResources } from "../sync";

import {
  FAKE_HASH,
  isResourcePermissionsRequest,
  jsonResponse,
  makeApp,
  setupResourceSyncTests,
  writeQuery,
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
      syncResources({
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

      if (isResourcePermissionsRequest(pathname, method, slug)) {
        permissionBodies.push(JSON.parse(String(init?.body)));
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

    expect(permissionBodies).toEqual([{ database_ids: [10, 20] }]);
  });
  // Repointing `resource_collection_entity_id` in `data_app.yaml` moves the app
  // to another collection and leaves its copies behind in the old one.
  describe("when the app's collection changed", () => {
    const PREVIOUS_COLLECTION_ID = 20;
    const CURRENT_COLLECTION_ID = 30;
    const COPIED_CARD_ID = 91;

    function serveApp(
      slug: string,
      card: { collection_id: number },
      moved: Array<{ id: number; collectionId: number }>,
    ) {
      jest.spyOn(global, "fetch").mockImplementation(async (input, init) => {
        const pathname = new URL(String(input)).pathname;
        const method = init?.method ?? "GET";

        if (pathname === `/api/apps/${slug}/draft` && method === "POST") {
          return jsonResponse({
            name: slug,
            resource_collection_id: CURRENT_COLLECTION_ID,
          });
        }
        if (pathname === `/api/card/${COPIED_CARD_ID}` && method === "GET") {
          return jsonResponse({ id: COPIED_CARD_ID, type: "model", ...card });
        }
        // Nothing declares the model any more, so the run also drops the copy.
        if (pathname === `/api/card/${COPIED_CARD_ID}` && method === "DELETE") {
          return jsonResponse(null, 204);
        }
        if (pathname === `/api/card/${COPIED_CARD_ID}` && method === "PUT") {
          const body = JSON.parse(String(init?.body));
          moved.push({ id: COPIED_CARD_ID, collectionId: body.collection_id });
          card.collection_id = body.collection_id;
          return jsonResponse({ id: COPIED_CARD_ID, type: "model", ...card });
        }
        if (isResourcePermissionsRequest(pathname, method, slug)) {
          return jsonResponse({
            name: slug,
            resource_collection_id: CURRENT_COLLECTION_ID,
          });
        }
        throw new Error(`Unexpected ${method} ${pathname}`);
      });
    }

    function syncedApp(cardCollectionId: number) {
      const appRoot = makeApp();
      fs.writeFileSync(
        path.join(appRoot, "resources_metadata.json"),
        JSON.stringify({
          collectionId: PREVIOUS_COLLECTION_ID,
          queries: [],
          models: [
            {
              sourceModelId: 5,
              copiedModelId: COPIED_CARD_ID,
              hash: FAKE_HASH,
              actions: [],
            },
          ],
        }),
      );

      const moved: Array<{ id: number; collectionId: number }> = [];
      serveApp(
        path.basename(appRoot),
        { collection_id: cardCollectionId },
        moved,
      );

      return { appRoot, moved };
    }

    const sync = (appRoot: string) =>
      syncResources({
        appRoot,
        metabaseUrl: "http://metabase.test",
        apiKey: "secret",
        log: jest.fn(),
      });

    it("moves a copy the app left behind, and records the new collection", async () => {
      const { appRoot, moved } = syncedApp(PREVIOUS_COLLECTION_ID);

      await sync(appRoot);

      expect(moved).toEqual([
        { id: COPIED_CARD_ID, collectionId: CURRENT_COLLECTION_ID },
      ]);
      expect(
        JSON.parse(
          fs.readFileSync(
            path.join(appRoot, "resources_metadata.json"),
            "utf8",
          ),
        ).collectionId,
      ).toBe(CURRENT_COLLECTION_ID);
    });

    // A copy somewhere else was displaced by hand, which the reconcilers refuse.
    it("leaves a copy that is in neither collection alone", async () => {
      const { appRoot, moved } = syncedApp(999);

      await expect(sync(appRoot)).rejects.toThrow(
        "no longer in the data app collection",
      );
      expect(moved).toEqual([]);
    });
  });
});
