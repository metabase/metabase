#!/usr/bin/env node
/* eslint-env node */
/* eslint-disable import/no-commonjs, import/order, no-console */
const fs = require("fs");
const path = require("path");

const SDK_DIST_DIR_PATH = path.resolve("./resources/embedding-sdk/dist");

/*
 * This script replaces all custom aliases in Embedding SDK generated ".d.ts" files so that this imports could be resolved
 * in the host app
 * */

// this map should be synced with "tsconfig.sdk.json"
const REPLACES_MAP = {
  "metabase-enterprise": "enterprise/frontend/src/metabase-enterprise",
  "metabase-lib": "frontend/src/metabase-lib",
  "metabase-types": "frontend/src/metabase-types",
  metabase: "frontend/src/metabase",
  "embedding-sdk": "enterprise/frontend/src/embedding-sdk",
  cljs: "target/cljs_release",
};

const traverseFilesTree = dir => {
  try {
    const results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
      file = path.join(dir, file);
      const stat = fs.statSync(file);
      if (stat && stat.isDirectory()) {
        results.push(...traverseFilesTree(file));
      } else if (file.endsWith(".d.ts")) {
        // Is a ".d.ts" file
        results.push(file);
      }
    });
    return results;
  } catch (error) {
    console.error(`Error when walking dir ${dir}`, error);
  }
};

const getRelativePath = (fromPath, toPath) => {
  const relativePath = path.relative(path.dirname(fromPath), toPath);
  return relativePath.startsWith(".") ? relativePath : "./" + relativePath;
};

const replaceAliasedImports = filePath => {
  let fileContent = fs.readFileSync(filePath, { encoding: "utf8" });

  Object.entries(REPLACES_MAP).forEach(([alias, targetPath]) => {
    const relativePath = getRelativePath(
      filePath,
      path.join(SDK_DIST_DIR_PATH, targetPath),
    );

    fileContent = fileContent
      .replaceAll(`from "${alias}/`, `from "${relativePath}/`)
      .replaceAll(`from "${alias}"`, `from "${relativePath}"`)
      .replaceAll(`import("${alias}`, `import("${relativePath}`)
      .replace(
        new RegExp(
          `import\\("(\\.\\.\/)*(frontend\/src\/)*${alias.replace("/", "\\/")}`,
          "gi",
        ),
        `import("${relativePath}`,
      );
  });

  fs.writeFileSync(filePath, fileContent, { encoding: "utf-8" });
  console.log(`Edited file: ${filePath}`);
};

const fixupTypesAfterCompilation = () => {
  console.log("[dts fixup] Fixing SDK d.ts files...");

  const dtsFilePaths = traverseFilesTree(SDK_DIST_DIR_PATH);

  dtsFilePaths.forEach(replaceAliasedImports);

  console.log("[dts fixup] Done!");
};

const watchFilesAndFixThem = () => {
  console.log("[dts fixup] Watching for changes in the SDK d.ts files...");
  // we need to keep track of the files that just edited
  // as they trigger a file save event otherwise we'd end up in a loop

  // NOTE: if this solution ends up being flaky for some reason, we could
  // just check if the file includes "@metabase/embedding-sdk-react", if it does
  // it means we can skip it
  const dirty = new Map();

  fs.watch(
    SDK_DIST_DIR_PATH,
    { recursive: true },
    async (eventType, filename) => {
      if (filename && filename.endsWith(".d.ts")) {
        if (dirty.get(filename)) {
          return dirty.set(filename, false);
        }
        console.log(
          "[dts fixup]",
          `File ${filename} changed, fixing the imports`,
        );
        dirty.set(filename, true);
        replaceAliasedImports(path.resolve(SDK_DIST_DIR_PATH, filename));
      }
    },
  );
};

const waitForFolder = async folderPath => {
  while (!fs.existsSync(folderPath)) {
    console.log(`Waiting for ${folderPath} to be created...`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
};

const isWatchMode = process.argv.includes("--watch");

const run = async () => {
  // when running on a clean state and with --watch, the folder might not exist yet
  await waitForFolder(SDK_DIST_DIR_PATH);
  fixupTypesAfterCompilation();

  if (isWatchMode) {
    console.log("\n\n\n");
    watchFilesAndFixThem();
  }
};

run();
