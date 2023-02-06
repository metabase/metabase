#!/usr/bin/env node
const { execSync } = require("child_process");

const path = require("path");
const glob = require("glob");
const chalk = require("chalk");

const e2eFileExtension = ".cy.spec.js";
const e2eHome = "frontend/test/metabase/scenarios/";

init();

function validateStagedFiles() {
  const stagedFiles = execSync("git diff HEAD --name-only --diff-filter=d", {
    encoding: "utf8",
  });
  const relevantStagedFiles = stagedFiles.includes(e2eHome);
  if (!relevantStagedFiles) {
    return;
  } else {
    const invalidFileNames = stagedFiles
      .split("\n")
      .filter(fullPath => {
        const dirName = path.dirname(fullPath);
        const excludedPaths =
          dirName.endsWith("/helpers") || dirName.endsWith("/shared");
        return dirName.startsWith(e2eHome) && !excludedPaths;
      })
      .filter(fullPath => {
        return !path.basename(fullPath).endsWith(e2eFileExtension);
      });

    printFeedback(invalidFileNames);
  }
}

function validateAllFiles() {
  // Will match all files in the scenarios dir, except the helpers
  const PATTERN =
    "frontend/test/metabase/scenarios/*/{*.js,!(helpers|shared)/*.js}";
  const invalidFileNames = glob.sync(PATTERN).filter(fullPath => {
    const basename = path.basename(fullPath);
    return !basename.endsWith(e2eFileExtension);
  });

  printFeedback(invalidFileNames);
}

function printHints() {
  console.log(
    "- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -",
  );
  console.log(
    `• Please make sure E2E specs have '${e2eFileExtension}' file extension.`,
  );
  console.log(
    `• You can place helpers and support files in 'helpers' or 'support' directories.`,
  );
  console.log(
    "- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -",
  );
}

function printFeedback(invalidFileNames) {
  if (invalidFileNames.length > 0) {
    console.error(
      chalk.red(
        `\nFound Cypress files not ending with '${e2eFileExtension}':\n\n`,
      ) + invalidFileNames.join("\n"),
    );

    printHints();

    return 1;
  }

  console.log("E2E file naming looks correct. Well done!");
  return 0;
}

function init() {
  const payload = process.argv.slice(2);
  const [scope] = payload;

  scope === "--staged" ? validateStagedFiles() : validateAllFiles();
}
