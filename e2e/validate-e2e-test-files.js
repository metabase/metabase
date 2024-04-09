#!/usr/bin/env node
const { execSync } = require("child_process");

const chalk = require("chalk");
const glob = require("glob");
const path = require("path");

const E2E_FILE_EXTENSION = /\.cy\.spec\.(js|ts)$/;
const E2E_HOME = "e2e/test/";

init();

function validateE2EFileNames(files) {
  if (!files || !Array.isArray(files)) {
    return;
  }

  const invalidFileNames = files.filter(fullPath => {
    return !path.basename(fullPath).match(E2E_FILE_EXTENSION);
  });

  printFeedback(invalidFileNames);
}

/**
 * @param {Array<string>} [files] Potential payload if used with `lint-staged`
 */
function validateStagedFiles(files) {
  validateE2EFileNames(files || getStagedFiles());
}

function validateAllFiles() {
  const allE2EFiles = getAllE2EFiles();
  validateE2EFileNames(allE2EFiles);
}

function getAllE2EFiles() {
  // Will match all files in the scenarios dir, except the ones in helpers and shared directories
  const PATTERN = `${E2E_HOME}*/{*.(js|ts),!(helpers|shared)/*.(js|ts)}`;

  return glob.sync(PATTERN);
}

function getStagedFiles() {
  const stagedFiles = execSync("git diff HEAD --name-only --diff-filter=d", {
    encoding: "utf8",
  });
  const hasRelevantFiles = stagedFiles.includes(E2E_HOME);

  if (hasRelevantFiles) {
    return stagedFiles.split("\n").filter(isE2ETestFile);
  }
}

function isE2ETestFile(fullPath) {
  const dirName = path.dirname(fullPath);
  const excludedPaths =
    dirName.endsWith("/helpers") || dirName.endsWith("/shared");
  return dirName.startsWith(E2E_HOME) && !excludedPaths;
}

function printHints() {
  console.log(
    "- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -",
  );
  console.log(
    `• Please make sure E2E specs have '${E2E_FILE_EXTENSION}' file extension.`,
  );
  console.log(
    "• You can place helpers and support files in 'helpers' or 'support' directories.",
  );
  console.log(
    "- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -",
  );
}

function printFeedback(invalidFileNames) {
  if (invalidFileNames.length) {
    console.error(
      chalk.red(
        `\nFound Cypress files not ending with '${E2E_FILE_EXTENSION}':\n\n`,
      ) + invalidFileNames.join("\n"),
    );

    printHints();

    process.exit(1);
  }

  console.log("E2E file naming looks correct. Well done!");
}

function init() {
  const payload = process.argv.slice(2);
  const [scope] = payload;

  if (!payload.length) {
    validateAllFiles();
  } else {
    scope === "--staged" ? validateStagedFiles() : validateStagedFiles(payload);
  }
}
