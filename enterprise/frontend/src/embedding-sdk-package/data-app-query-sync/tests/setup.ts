import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function setupQuerySyncTests(): void {
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
    "exports.defineQuery = (query) => query;",
  );

  return appRoot;
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

export function isQuerySyncPermissionsRequest(
  pathname: string,
  method: string,
  slug: string,
) {
  return (
    pathname === `/api/apps/${slug}/query-sync/permissions` && method === "PUT"
  );
}
