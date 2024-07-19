#!/usr/bin/env node
/* eslint-env node */
/* eslint-disable import/no-commonjs, import/order, no-console */
const fs = require("fs");
const path = require("path");

const IGNORED_PACKAGES = ["react", "react-dom"];
const SDK_DIST_DIR = path.resolve("./resources/embedding-sdk");

const CLI_DEPENDENCIES = [
  "chalk",
  "@inquirer/prompts",
  "commander",
  "semver"
]

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
    devDependencies: getDevDependenciesForCLI(mainPackageJsonContent.devDependencies)
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

/**
 * Copies a directory and its contents to the target directory.
 * @param {string} source - The source directory path.
 * @param {string} target - The target directory path.
 */
function copyDirToOutput(source, target) {
  const sourcePath = path.resolve(`./enterprise/${source}`);
  const targetPath = path.resolve(path.join(SDK_DIST_DIR, target));

  // Ensure target directory exists
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
  }

  // Read contents of the source directory
  const entries = fs.readdirSync(sourcePath, { withFileTypes: true });

  for (const entry of entries) {
    const sourceEntryPath = path.join(sourcePath, entry.name);
    const targetEntryPath = path.join(targetPath, entry.name);

    if (entry.isDirectory()) {
      // Recursively copy directory
      copyDirToOutput(
        path.join(source, entry.name),
        path.join(target, entry.name),
      );
    } else {
      // Copy file
      fs.copyFileSync(sourceEntryPath, targetEntryPath);
    }
  }
}

function getDevDependenciesForCLI(dependencies) {
  const outDeps = {};

  Object.entries(dependencies).forEach(([packageName, version]) => {
    if (CLI_DEPENDENCIES.includes(packageName)) {
      outDeps[packageName] = version;
    }
  });

  return outDeps;
}

if (!fs.existsSync(SDK_DIST_DIR)) {
  fs.mkdirSync(SDK_DIST_DIR);
}

generateSdkPackage();
copyFileToOutput("LICENSE.txt");
copyFileToOutput("frontend/src/embedding-sdk/README.md", "README.md");
copyFileToOutput("frontend/src/embedding-sdk/CHANGELOG.md", "CHANGELOG.md");
copyDirToOutput("frontend/src/embedding-sdk/cli", "cli");
