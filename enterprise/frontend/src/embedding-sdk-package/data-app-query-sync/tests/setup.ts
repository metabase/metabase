import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function makeApp() {
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

export function writeQuery(appRoot: string, body: string) {
  const filePath = path.join(appRoot, "queries/orders.query.ts");

  fs.writeFileSync(
    filePath,
    `import { defineQuery } from "@metabase/embedding-sdk-react/data-app";\n${body}\n`,
  );

  return filePath;
}

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
