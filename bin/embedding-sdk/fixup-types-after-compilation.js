#!/usr/bin/env node
/* eslint-env node */
/* eslint-disable import/no-commonjs, import/order, no-console */
const fs = require("fs");
const path = require("path");

const SDK_DIST_DIR_PATH = path.resolve("./resources/embedding-sdk/dist");
const SDK_PACKAGE_NAME = "@metabase/embedding-sdk-react";

/*
 * This script replaces all custom aliases in Embedding SDK generated ".d.ts" files so that this imports could be resolved
 * in the host app
 * */

// this map should be synced with "tsconfig.sdk.json"
const REPLACES_MAP = {
  "metabase-enterprise/": `${SDK_PACKAGE_NAME}/dist/enterprise/frontend/src/metabase-enterprise/`,
  "metabase-lib/": `${SDK_PACKAGE_NAME}/dist/frontend/src/metabase-lib/`,
  "metabase-lib": `${SDK_PACKAGE_NAME}/dist/frontend/src/metabase-lib`,
  "metabase-shared/": `${SDK_PACKAGE_NAME}/dist/frontend/src/metabase-shared/`,
  "metabase-types/": `${SDK_PACKAGE_NAME}/dist/frontend/src/metabase-types/`,
  "metabase/": `${SDK_PACKAGE_NAME}/dist/frontend/src/metabase/`,
  "embedding-sdk/": `${SDK_PACKAGE_NAME}/dist/enterprise/frontend/src/embedding-sdk/`,
  "cljs/": `${SDK_PACKAGE_NAME}/dist/target/cljs_release/`,
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

const replaceAliasedImports = filePath => {
  let fileContent = fs.readFileSync(filePath, { encoding: "utf8" });

  Object.entries(REPLACES_MAP).forEach(([alias, replacement]) => {
    fileContent = fileContent
      .replaceAll(`from "${alias}`, `from "${replacement}`)
      .replaceAll(`import("${alias}`, `import("${replacement}`)
      .replace(
        // replace dynamic imports using alias, with possible relative paths - "../../" and "frontend/src/"
        // import("(../)*(frontend/src/)*<alias>
        new RegExp(
          `import\\("(\\.\\.\/)*(frontend\/src\/)*${alias.replace("/", "\\/")}`,
          "gi",
        ),
        `import("${replacement}`,
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
