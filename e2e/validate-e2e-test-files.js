#!/usr/bin/env node
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const chalk = require("chalk");
const glob = require("glob");

const E2E_FILE_EXTENSION = /\.cy\.spec\.(js|ts)$/;
const E2E_HOME = "e2e/test/";

// Specs that touch the QA databases (postgres/mysql/mongo docker containers)
// must be tagged, because CI only starts those containers for the tagged
// jobs/chunks — an untagged spec would hit a database that isn't running.
// See the "Prepare Docker containers" step in .github/workflows/e2e-test.yml.
const QA_DB_USAGE_PATTERN =
  /restore\("(postgres|mysql|mongo)[^"]*"\)|resetTestTable|queryWritableDB|queryQADB|connectAndQueryDB|addPostgresDatabase|addMySQLDatabase|addMongoDatabase|setupWritableDB/;
const QA_DB_TAGS_PATTERN = /@external|@mongo|@python|@OSS/;

init();

function validateE2EFileNames(files) {
  if (!files || !Array.isArray(files)) {
    return;
  }

  const invalidFileNames = files.filter((fullPath) => {
    return !path.basename(fullPath).match(E2E_FILE_EXTENSION);
  });

  printFeedback(invalidFileNames);
  validateQADatabaseTags(files);
}

function validateQADatabaseTags(files) {
  const untaggedQADatabaseSpecs = files.filter((fullPath) => {
    if (
      !path.basename(fullPath).match(E2E_FILE_EXTENSION) ||
      !fs.existsSync(fullPath)
    ) {
      return false;
    }

    const content = fs.readFileSync(fullPath, "utf8");
    return (
      QA_DB_USAGE_PATTERN.test(content) && !QA_DB_TAGS_PATTERN.test(content)
    );
  });

  if (untaggedQADatabaseSpecs.length) {
    console.error(
      chalk.red(
        "\nFound Cypress specs that use QA databases without a routing tag:\n\n",
      ) + untaggedQADatabaseSpecs.join("\n"),
    );
    console.error(
      "\nSpecs that restore a QA-database snapshot or query the QA databases must tag the describe/it blocks doing so (usually with '{ tags: \"@external\" }'). CI only starts the postgres/mysql/mongo containers for the tagged chunks, so untagged usage fails there with connection errors.\n",
    );

    process.exit(1);
  }
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
    if (scope === "--staged") {
      validateStagedFiles();
    } else {
      validateStagedFiles(payload);
    }
  }
}
