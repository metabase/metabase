#!/usr/bin/env node
/* eslint-env node */
/* eslint-disable import/no-commonjs, import/order, no-console */
const fs = require("fs");
const path = require("path");

const IGNORED_REACT_PACKAGES = ["react", "react-dom"];
const IGNORED_TYPES_DEPENDENCIES = [
  "@types/react",
  "@types/react-dom",
  "@types/react-router",
  "@types/redux-auth-wrapper",
];
const IGNORED_NOT_USED_BY_SDK_PACKAGES = [
  // Not used in the SDK, and triggers code-scanning errors
  "react-ansi-style",
];
const IGNORED_DEPENDENCIES = [
  ...IGNORED_REACT_PACKAGES,
  ...IGNORED_TYPES_DEPENDENCIES,
  ...IGNORED_NOT_USED_BY_SDK_PACKAGES,
];

const SDK_DIST_DIR = path.resolve("./resources/embedding-sdk");

function filterOuDependencies(object) {
  const result = {};

  Object.entries(object).forEach(([packageName, version]) => {
    if (!IGNORED_DEPENDENCIES.includes(packageName)) {
      result[packageName] = version;
    }
  });

  return result;
}

function generateSdkPackage() {
  let maybeCommitHash = process.argv[2];

  if (maybeCommitHash) {
    // get short commit hash
    maybeCommitHash = maybeCommitHash.slice(0, 7);
  }

  const mainPackageJson = fs.readFileSync(
    path.resolve("./package.json"),
    "utf-8",
  );

  const mainPackageJsonContent = JSON.parse(mainPackageJson);

  const sdkPackageTemplateJson = fs.readFileSync(
    path.resolve(
      "./enterprise/frontend/src/embedding-sdk-bundle/package.template.json",
    ),
    "utf-8",
  );
  const sdkPackageTemplateJsonContent = JSON.parse(sdkPackageTemplateJson);

  const todayDate = new Date().toJSON().slice(0, 10).replaceAll("-", "");

  const mergedContent = {
    ...sdkPackageTemplateJsonContent,
    dependencies: filterOuDependencies(mainPackageJsonContent.dependencies),
    resolutions: filterOuDependencies(mainPackageJsonContent.resolutions),
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
copyFileToOutput("frontend/src/embedding-sdk-bundle/README.md", "README.md");
copyFileToOutput(
  "frontend/src/embedding-sdk-bundle/CHANGELOG.md",
  "CHANGELOG.md",
);
