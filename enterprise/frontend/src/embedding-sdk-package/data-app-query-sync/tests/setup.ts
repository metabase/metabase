import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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

export const FAKE_HASH = `v1:sha256:${"0".repeat(64)}`;

export function writeQueryLockfile(
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
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
