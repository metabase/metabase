import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { dump as dumpYaml } from "js-yaml";

const appRoots: string[] = [];

/** Removes every app `makeApp` created and restores mocks after each test. */
export function setupResourceTests(): void {
  afterEach(() => {
    jest.restoreAllMocks();

    appRoots
      .splice(0)
      .forEach((appRoot) =>
        fs.rmSync(appRoot, { recursive: true, force: true }),
      );
  });
}

/** Creates an app directory with `queries/`, `actions/`, and a stub of the SDK's data-app entry. */
export function makeApp() {
  const appRoot = fs.mkdtempSync(path.join(os.tmpdir(), "data-app-resources-"));
  appRoots.push(appRoot);

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

export function writeQuery(appRoot: string, body: string) {
  const filePath = path.join(appRoot, "queries/orders.query.ts");
  fs.writeFileSync(
    filePath,
    `import { defineQuery } from "@metabase/embedding-sdk-react/data-app";\n${body}\n`,
  );
  return filePath;
}

/** Writes `entity` as YAML to `resources/<relativePath>`. */
export function writeResource(
  appRoot: string,
  relativePath: string,
  entity: Record<string, unknown>,
) {
  const filePath = path.join(appRoot, "resources", relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, dumpYaml(entity));
  return filePath;
}
