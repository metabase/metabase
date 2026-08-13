import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { readResourceLockfile } from "../lockfile";

export function setupResourceSyncTests(): void {
  const appRoots: string[] = [];
  afterEach(() => {
    jest.restoreAllMocks();
    appRoots.forEach((appRoot) =>
      fs.rmSync(appRoot, { recursive: true, force: true }),
    );
  });

  trackedAppRoots = appRoots;
}

let trackedAppRoots: string[] | undefined;

export function makeApp() {
  const appRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "data-app-query-sync-"),
  );
  trackedAppRoots?.push(appRoot);

  fs.mkdirSync(path.join(appRoot, "queries"));
  fs.mkdirSync(path.join(appRoot, "actions"));
  fs.writeFileSync(
    path.join(appRoot, "data_app.yaml"),
    "name: Test data app\npath: dist/index.js\n",
  );

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
    [
      "exports.defineQuery = (query) => query;",
      "exports.defineAction = (definition) => definition;",
    ].join("\n"),
  );

  return appRoot;
}

export function writeAction(appRoot: string, body: string) {
  const filePath = path.join(appRoot, "actions/orders.action.ts");
  fs.writeFileSync(
    filePath,
    `import { defineAction } from "@metabase/embedding-sdk-react/data-app";\n${body}\n`,
  );
  return filePath;
}

/** Reads the lockfile through the real parser, so tests also assert it stays valid. */
export function readLockfile(appRoot: string) {
  return readResourceLockfile(appRoot);
}

export const FAKE_HASH = `v1:sha256:${"0".repeat(64)}`;

/** Writes a lockfile holding only query entries, in the real on-disk shape. */
export function seedQueries(
  appRoot: string,
  queries: Array<{
    tableId: number;
    hash: string;
    savedQuestionSourceId: number;
  }>,
) {
  fs.writeFileSync(
    path.join(appRoot, "resources_metadata.json"),
    JSON.stringify({ queries, models: [] }),
  );
}

export function writeQuery(appRoot: string, body: string) {
  const filePath = path.join(appRoot, "queries/orders.query.ts");
  fs.writeFileSync(
    filePath,
    `import { defineQuery } from "@metabase/embedding-sdk-react/data-app";\n${body}\n`,
  );
  return filePath;
}

export function jsonResponse(body: unknown, status = 200) {
  const responseBody =
    typeof body === "object" &&
    body !== null &&
    "resource_collection_id" in body
      ? {
          resource_collection_entity_id: "resourcecollectionid1",
          permission_group_entity_id: "permissiongroupid0001",
          ...body,
        }
      : body;

  return new Response(status === 204 ? null : JSON.stringify(responseBody), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function isResourcePermissionsRequest(
  pathname: string,
  method: string,
  slug: string,
) {
  return (
    pathname === `/api/apps/${slug}/resources/permissions` && method === "PUT"
  );
}

/** The fields the fake reads; everything else is passed through untouched. */
type Row = { id: number; model_id?: number } & Record<string, unknown>;

export interface FakeMetabase {
  cards: Map<number, Row>;
  actions: Map<number, Row>;
  requests: Array<{
    method: string;
    pathname: string;
    body: Record<string, unknown> | undefined;
  }>;
  nextId: number;
}

export function createFakeMetabase(seed: {
  cards?: Row[];
  actions?: Row[];
}): FakeMetabase {
  return {
    cards: new Map((seed.cards ?? []).map((card) => [card.id, card])),
    actions: new Map((seed.actions ?? []).map((action) => [action.id, action])),
    requests: [],
    nextId: 900,
  };
}

export function called(fake: FakeMetabase, method: string, pathname: string) {
  return fake.requests.some(
    (request) => request.method === method && request.pathname === pathname,
  );
}

/**
 * Serves the endpoints query synchronization uses, including the app DB's
 * `ON DELETE CASCADE` from a model card to the actions hanging off it.
 */
export function mockMetabase(
  fake: FakeMetabase,
  { slug, collectionId }: { slug: string; collectionId: number },
) {
  const appMetadata = { name: slug, resource_collection_id: collectionId };

  jest.spyOn(global, "fetch").mockImplementation(async (input, init) => {
    const pathname = new URL(String(input)).pathname;
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    fake.requests.push({ method, pathname, body });

    if (pathname === `/api/apps/${slug}/draft` && method === "POST") {
      return jsonResponse(appMetadata);
    }

    if (isResourcePermissionsRequest(pathname, method, slug)) {
      return jsonResponse(appMetadata);
    }

    if (pathname === `/api/apps/${slug}/query` && method === "POST") {
      return jsonResponse({ database_id: 1, dataset_query: { database: 1 } });
    }

    if (pathname === "/api/card" && method === "POST") {
      const id = fake.nextId++;
      fake.cards.set(id, { ...body, id });
      return jsonResponse(fake.cards.get(id));
    }
    if (pathname === "/api/action" && method === "POST") {
      const id = fake.nextId++;
      fake.actions.set(id, { ...body, id });
      return jsonResponse(fake.actions.get(id));
    }

    const cardId = /^\/api\/card\/(\d+)$/.exec(pathname)?.[1];
    if (cardId) {
      const id = Number(cardId);
      const card = fake.cards.get(id);

      if (!card) {
        return jsonResponse({ message: "Not found" }, 404);
      }

      if (method === "GET") {
        return jsonResponse(card);
      }

      if (method === "PUT") {
        fake.cards.set(id, { ...card, ...body, id });
        return jsonResponse(fake.cards.get(id));
      }

      if (method === "DELETE") {
        fake.cards.delete(id);

        for (const [actionId, action] of [...fake.actions]) {
          if (action.model_id === id) {
            fake.actions.delete(actionId);
          }
        }

        return jsonResponse(null, 204);
      }
    }

    const actionId = /^\/api\/action\/(\d+)$/.exec(pathname)?.[1];

    if (actionId) {
      const id = Number(actionId);
      const action = fake.actions.get(id);

      if (!action) {
        return jsonResponse({ message: "Not found" }, 404);
      }

      if (method === "GET") {
        return jsonResponse(action);
      }

      if (method === "PUT") {
        fake.actions.set(id, { ...action, ...body, id });
        return jsonResponse(fake.actions.get(id));
      }

      if (method === "DELETE") {
        fake.actions.delete(id);
        return jsonResponse(null, 204);
      }
    }

    throw new Error(`Unexpected ${method} ${pathname}`);
  });
}
