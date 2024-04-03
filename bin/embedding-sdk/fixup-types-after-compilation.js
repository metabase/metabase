#!/usr/bin/env node
/* eslint-env node */
/* eslint-disable import/no-commonjs, import/order, no-console */
const fs = require("fs");
const path = require("path");

const SDK_DIST_DIR_PATH = path.resolve("./resources/embedding-sdk/dist");
const SDK_PACKAGE_NAME = "@metabase/embedding-sdk-react";

const walk = dir => {
  try {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
      file = path.join(dir, file);
      const stat = fs.statSync(file);
      if (stat && stat.isDirectory()) {
        // Recurse into subdir
        results = [...results, ...walk(file)];
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

const edit = filePath => {
  const oldContent = fs.readFileSync(filePath, { encoding: "utf8" });

  const enterpriseImport = `from "metabase-enterprise/`;
  const enterpriseImportReplace = `from "${SDK_PACKAGE_NAME}/dist/enterprise/frontend/src/metabase-enterprise/`;

  const mainProjectImport = `from "metabase`;
  const mainProjectImportReplace = `from "${SDK_PACKAGE_NAME}/dist/frontend/src/metabase`;

  // const mainProjectImport = 'from "metabase';
  // const mainProjectImportReplace = `from "${SDK_PACKAGE_NAME}/dist/frontend/src/metabase`;

  const newContent = oldContent
    .replaceAll(enterpriseImport, enterpriseImportReplace)
    .replaceAll(mainProjectImport, mainProjectImportReplace);
  fs.writeFileSync(filePath, newContent, { encoding: "utf-8" });
  console.log(`Edited file: ${filePath}`);
};

const fixupTypesAfterCompilation = () => {
  const filePaths = walk(SDK_DIST_DIR_PATH);

  filePaths.forEach(edit);
};

fixupTypesAfterCompilation();
