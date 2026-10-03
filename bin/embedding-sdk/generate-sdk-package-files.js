#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const SDK_DIST_DIR = path.resolve("./resources/embedding-sdk");

function generateSdkPackage() {
  let maybeCommitHash = process.argv[2];

  if (maybeCommitHash) {
    // get short commit hash
    maybeCommitHash = maybeCommitHash.slice(0, 7);
  }

  const mainPackageJsonContent = JSON.parse(
    fs.readFileSync(path.resolve("./package.json"), "utf-8"),
  );

  const sdkPackageTemplateJson = fs.readFileSync(
    path.resolve(
      "./enterprise/frontend/src/embedding-sdk-package/package.template.json",
    ),
    "utf-8",
  );
  const sdkPackageTemplateJsonContent = JSON.parse(sdkPackageTemplateJson);

  // `sdkRelease` is release-process metadata (distTag/tagAsLatest) read by
  // .github/workflows/release-embedding-sdk.yml — it must never ship inside
  // the published npm package.json.
  const { sdkRelease: _sdkRelease, ...publishableTemplateJsonContent } =
    sdkPackageTemplateJsonContent;

  const todayDate = new Date().toJSON().slice(0, 10).replaceAll("-", "");

  const mergedContent = {
    ...publishableTemplateJsonContent,

    version: maybeCommitHash
      ? `${sdkPackageTemplateJsonContent.version}-${todayDate}-${maybeCommitHash}`
      : sdkPackageTemplateJsonContent.version,

    // Runtime dependencies of the CLI for data apps, not pre-bundled.
    dependencies: {
      // Compiles app definitions and local imports for the CLI to evaluate.
      esbuild: mainPackageJsonContent.devDependencies.esbuild,

      // Parses and edits TypeScript source files during resource sync.
      typescript: mainPackageJsonContent.dependencies.typescript,
    },
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
copyFileToOutput("frontend/src/embedding-sdk-package/README.md", "README.md");
copyFileToOutput(
  "frontend/src/embedding-sdk-package/CHANGELOG.md",
  "CHANGELOG.md",
);
