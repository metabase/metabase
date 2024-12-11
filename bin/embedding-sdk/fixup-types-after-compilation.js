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
  const dtsFilePaths = traverseFilesTree(SDK_DIST_DIR_PATH);

  dtsFilePaths.forEach(replaceAliasedImports);
};

fixupTypesAfterCompilation();
