import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { canonicalJson, queryFingerprint } from "./canonical";
import { discoverQueries } from "./discover";
import { checkQuerySync, syncQueries } from "./sync";

function makeApp() {
  const appRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "data-app-query-sync-"),
  );
  fs.mkdirSync(path.join(appRoot, "queries"));
  const packageRoot = path.join(
    appRoot,
    "node_modules/@metabase/embedding-sdk-react",
  );
  fs.mkdirSync(packageRoot, { recursive: true });
  fs.writeFileSync(
    path.join(packageRoot, "package.json"),
    JSON.stringify({
      name: "@metabase/embedding-sdk-react",
      exports: { "./data-app": "./data-app.js" },
    }),
  );
  fs.writeFileSync(
    path.join(packageRoot, "data-app.js"),
    "exports.defineQuery = (query) => query;",
  );
  return appRoot;
}

function writeQuery(appRoot: string, body: string) {
  const filePath = path.join(appRoot, "queries/orders.query.ts");
  fs.writeFileSync(
    filePath,
    `import { defineQuery } from "@metabase/embedding-sdk-react/data-app";\n${body}\n`,
  );
  return filePath;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("data app query synchronization", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("uses a property-order-independent authored DSL fingerprint", () => {
    const first = queryFingerprint({
      source: { type: "table", id: 1 },
      limit: 5,
    });
    const second = queryFingerprint({
      limit: 5,
      source: { id: 2, type: "table" },
      savedQuestionSourceId: 99,
    });
    expect(first.hash).toBe(second.hash);
    expect(first.tableId).toBe(1);
    expect(second.tableId).toBe(2);
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

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
      `Metabase returned 404 for POST http://metabase.test/api/apps/${slug}/query-sync: Not found.`,
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
      if (pathname === `/api/apps/${slug}/query-sync` && method === "POST") {
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

  it("prepares an unpublished app before query reconciliation", async () => {
    const appRoot = makeApp();
    const slug = path.basename(appRoot);
    const requests: Array<{ method: string; pathname: string }> = [];
    jest.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const pathname = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      requests.push({ method, pathname });
      if (pathname === `/api/apps/${slug}/query-sync` && method === "POST") {
        return jsonResponse({
          name: slug,
          resource_collection_id: 20,
        });
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
      { method: "POST", pathname: `/api/apps/${slug}/query-sync` },
    ]);
  });

  it("discovers direct named definitions and rejects copied IDs", async () => {
    const appRoot = makeApp();
    writeQuery(
      appRoot,
      `export const First = defineQuery({ savedQuestionSourceId: 10, source: { type: "table", id: 1 } });
       export const Second = defineQuery({ savedQuestionSourceId: 10, source: { type: "table", id: 1 } });`,
    );
    await expect(discoverQueries(appRoot)).rejects.toThrow(
      "Saved question 10 is referenced by",
    );
  });

  it("fails a read-only build check when source and lockfile drift", async () => {
    const appRoot = makeApp();
    writeQuery(
      appRoot,
      `export const Orders = defineQuery({ savedQuestionSourceId: 10, source: { type: "table", id: 1 }, limit: 5 });`,
    );
    fs.writeFileSync(
      path.join(appRoot, "queries_metadata.json"),
      JSON.stringify([
        {
          tableId: 1,
          hash: `v1:sha256:${"0".repeat(64)}`,
          savedQuestionSourceId: 10,
        },
      ]),
    );
    await expect(checkQuerySync(appRoot)).rejects.toThrow(
      "is not synchronized",
    );
  });

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
      if (pathname === `/api/apps/${slug}/query-sync` && method === "POST") {
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
    expect(requests.filter(({ method }) => method === "POST")).toHaveLength(5);
    expect(requests.some(({ method }) => method === "PUT")).toBe(false);
  });

  it("deletes only lockfile-proven questions in the bound collection", async () => {
    const appRoot = makeApp();
    const slug = path.basename(appRoot);
    fs.writeFileSync(
      path.join(appRoot, "queries_metadata.json"),
      JSON.stringify([
        {
          tableId: 1,
          hash: `v1:sha256:${"0".repeat(64)}`,
          savedQuestionSourceId: 40,
        },
      ]),
    );
    const requests: Array<{ method: string; pathname: string }> = [];
    jest.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const pathname = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      requests.push({ method, pathname });
      if (pathname === `/api/apps/${slug}/query-sync` && method === "POST") {
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
      throw new Error(`Unexpected ${method} ${pathname}`);
    });

    await syncQueries({
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
        fs.readFileSync(path.join(appRoot, "queries_metadata.json"), "utf8"),
      ),
    ).toEqual([]);
  });

  it("recreates a lockfile-proven question only after a confirmed 404", async () => {
    const appRoot = makeApp();
    const slug = path.basename(appRoot);
    const filePath = writeQuery(
      appRoot,
      `export const Orders = defineQuery({ savedQuestionSourceId: 50, source: { type: "table", id: 1 } });`,
    );
    const [query] = await discoverQueries(appRoot);
    fs.writeFileSync(
      path.join(appRoot, "queries_metadata.json"),
      JSON.stringify([
        {
          tableId: query.tableId,
          hash: query.hash,
          savedQuestionSourceId: 50,
        },
      ]),
    );
    jest.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const pathname = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      if (pathname === `/api/apps/${slug}/query-sync` && method === "POST") {
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
      throw new Error(`Unexpected ${method} ${pathname}`);
    });

    await syncQueries({
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
        fs.readFileSync(path.join(appRoot, "queries_metadata.json"), "utf8"),
      ),
    ).toEqual([
      {
        tableId: 1,
        hash: query.hash,
        savedQuestionSourceId: 51,
      },
    ]);
  });

  it("restores a missing inline ID from an unambiguous lockfile entry", async () => {
    const appRoot = makeApp();
    const slug = path.basename(appRoot);
    const filePath = writeQuery(
      appRoot,
      `export const Orders = defineQuery({ source: { type: "table", id: 1 } });`,
    );
    const [query] = await discoverQueries(appRoot);
    fs.writeFileSync(
      path.join(appRoot, "queries_metadata.json"),
      JSON.stringify([
        {
          tableId: query.tableId,
          hash: query.hash,
          savedQuestionSourceId: 55,
        },
      ]),
    );
    const requests: Array<{ method: string; pathname: string }> = [];
    const log = jest.fn();
    jest.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const pathname = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      requests.push({ method, pathname });
      if (pathname === `/api/apps/${slug}/query-sync` && method === "POST") {
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
      throw new Error(`Unexpected ${method} ${pathname}`);
    });

    await syncQueries({
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
      if (pathname === `/api/apps/${slug}/query-sync` && method === "POST") {
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
      if (pathname === `/api/apps/${slug}/query-sync` && method === "POST") {
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
      if (pathname === `/api/apps/${slug}/query-sync` && method === "POST") {
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

  it("explains how to recover a removed query whose card moved", async () => {
    const appRoot = makeApp();
    const slug = path.basename(appRoot);
    fs.writeFileSync(
      path.join(appRoot, "queries_metadata.json"),
      JSON.stringify([
        {
          tableId: 1,
          hash: `v1:sha256:${"0".repeat(64)}`,
          savedQuestionSourceId: 90,
        },
      ]),
    );
    jest.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const pathname = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      if (pathname === `/api/apps/${slug}/query-sync` && method === "POST") {
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
      syncQueries({
        appRoot,
        metabaseUrl: "http://metabase.test",
        apiKey: "secret",
        log: jest.fn(),
      }),
    ).rejects.toThrow(
      "Move card 90 back to data app collection 20 or delete it manually, then run sync-queries again.",
    );
  });
});
