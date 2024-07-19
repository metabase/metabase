#!/usr/bin/env node
/* eslint-env node */
/* eslint-disable import/no-commonjs, import/order, no-console */
const fs = require("fs");
const path = require("path");

const IGNORED_PACKAGES = ["react", "react-dom"];
const SDK_DIST_DIR = path.resolve("./resources/embedding-sdk");

function filterOutReactDependencies(object) {
  const result = {};

  Object.entries(object).forEach(([packageName, version]) => {
    if (!IGNORED_PACKAGES.includes(packageName)) {
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
      "./enterprise/frontend/src/embedding-sdk/package.template.json",
    ),
    "utf-8",
  );
  const sdkPackageTemplateJsonContent = JSON.parse(sdkPackageTemplateJson);

  const todayDate = new Date().toJSON().slice(0, 10).replaceAll("-", "");

  const mergedContent = {
    ...sdkPackageTemplateJsonContent,
    dependencies: filterOutReactDependencies(
      mainPackageJsonContent.dependencies,
    ),
    resolutions: filterOutReactDependencies(mainPackageJsonContent.resolutions),
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
