#!/usr/bin/env node
/* eslint-env node */
/* eslint-disable import/no-commonjs, import/order, no-console */
const fs = require("fs");
const path = require("path");
const {
  getPackageJsonContent,
} = require("../../frontend/build/embedding-sdk/utils/get-package-json-content.mjs");
const {
  filterExternalDependencies,
} = require("../../frontend/build/embedding-sdk/utils/filter-external-dependencies.mjs");

const SDK_DIST_DIR = path.resolve("./resources/embedding-sdk");

const IGNORED_REACT_PACKAGES = ["react", "react-dom"];
// These deps may add conflicting types
const IGNORED_TYPES_DEPENDENCIES = [
  "@types/react",
  "@types/react-dom",
  "@types/react-router",
  "@types/redux-auth-wrapper",
];

function getSdkDependencies(dependencies) {
  return filterExternalDependencies(dependencies, [
    ...IGNORED_REACT_PACKAGES,
    ...IGNORED_TYPES_DEPENDENCIES,
  ]);
}

function generateSdkPackage() {
  let maybeCommitHash = process.argv[2];

  if (maybeCommitHash) {
    // get short commit hash
    maybeCommitHash = maybeCommitHash.slice(0, 7);
  }

  const mainPackageJsonContent = getPackageJsonContent();

  const sdkPackageTemplateJson = fs.readFileSync(
    path.resolve(
      "./enterprise/frontend/src/embedding-sdk/package.template.json",
    ),
    "utf-8",
  );
  const sdkPackageTemplateJsonContent = JSON.parse(sdkPackageTemplateJson);

  const todayDate = new Date().toJSON().slice(0, 10).replaceAll("-", "");

  const mergedContent = {
    ...sdkPackageTemplateJsonContent,
    dependencies: getSdkDependencies(mainPackageJsonContent.dependencies),
    resolutions: getSdkDependencies(mainPackageJsonContent.resolutions),
    version: maybeCommitHash
      ? `${sdkPackageTemplateJsonContent.version}-${todayDate}-${maybeCommitHash}`
      : sdkPackageTemplateJsonContent.version,
  };

  const mergedContentString = JSON.stringify(mergedContent, null, 2);

  console.log("Generated SDK package.json:");
  console.log(mergedContentString);

  fs.writeFileSync(
    path.resolve(path.join(SDK_DIST_DIR), "package.json"),
    mergedContentString,
    "utf-8",
  );
}

/**
 * @param {string} source
 * @param {string} target
 */
function copyFileToOutput(source, target = source) {
  const fileContent = fs.readFileSync(
    path.resolve(`./enterprise/${source}`),
    "utf-8",
  );

  fs.writeFileSync(
    path.resolve(path.join(SDK_DIST_DIR), target),
    fileContent,
    "utf-8",
  );
}

if (!fs.existsSync(SDK_DIST_DIR)) {
  fs.mkdirSync(SDK_DIST_DIR);
}

generateSdkPackage();
copyFileToOutput("LICENSE.txt");
copyFileToOutput("frontend/src/embedding-sdk/README.md", "README.md");
copyFileToOutput("frontend/src/embedding-sdk/CHANGELOG.md", "CHANGELOG.md");
