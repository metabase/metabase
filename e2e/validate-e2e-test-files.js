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
// The restore alternative also matches template literals like
// H.restore(`${dialect}-writable`).
const QA_DB_USAGE_PATTERN =
  /restore\([^)]*(postgres|mysql|mongo|-writable)|resetTestTable|queryWritableDB|queryQADB|connectAndQueryDB|addPostgresDatabase|addMySQLDatabase|addMongoDatabase|setupWritableDB/;
const QA_DB_TAGS_PATTERN = /@external|@mongo|@python|@OSS/;

// @cypress/grep matches tags literally, so "external" (missing @) or
// "@external " (trailing space) silently never match the CI grep filters.
const TAGS_OPTION_PATTERN = /tags:\s*(\[[^\]]*\]|"[^"]*"|'[^']*')/g;
const VALID_TAG_PATTERN = /^@[A-Za-z0-9_-]+$/;

init();

function validateE2EFileNames(files) {
  if (!files || !Array.isArray(files)) {
    return;
  }

  const invalidFileNames = files.filter((fullPath) => {
    return (
      !path.basename(fullPath).match(E2E_FILE_EXTENSION) &&
      // support files (constants, fixtures) can use any name — only files
      // that declare tests must use the spec extension so that the Cypress
      // specPattern picks them up
      fs.existsSync(fullPath) &&
      /^\s*(describe|it)[.(]/m.test(fs.readFileSync(fullPath, "utf8"))
    );
  });

  printFeedback(invalidFileNames);
  validateQADatabaseTags(files);
}

/**
 * Splits a spec file into blocks along its top-level (column 0) statements,
 * so each top-level `describe` can be checked for QA database usage and tags
 * independently — a file-level check would let a tag on one describe mask
 * untagged usage in a sibling describe.
 *
 * @returns {Array<{ isDescribe: boolean, line: number, text: string }>}
 */
function splitTopLevelBlocks(content) {
  const lines = content.split("\n");
  const blocks = [];
  let current = null;

  lines.forEach((line, index) => {
    // any non-indented statement starts a new top-level block
    if (/^[A-Za-z]/.test(line)) {
      current = {
        isDescribe: /^(H\.)?describe/.test(line),
        line: index + 1,
        text: "",
      };
      blocks.push(current);
    }

    if (current) {
      current.text += line + "\n";
    }
  });

  return blocks;
}

function validateQADatabaseTags(files) {
  const problems = [];

  files.forEach((fullPath) => {
    if (
      !path.basename(fullPath).match(E2E_FILE_EXTENSION) ||
      !fs.existsSync(fullPath)
    ) {
      return;
    }

    const content = fs.readFileSync(fullPath, "utf8");

    for (const match of content.matchAll(TAGS_OPTION_PATTERN)) {
      const tags = match[1].match(/["']([^"']*)["']/g) || [];
      for (const quoted of tags) {
        const tag = quoted.slice(1, -1);
        if (!VALID_TAG_PATTERN.test(tag)) {
          const line = content.slice(0, match.index).split("\n").length;
          problems.push(
            `${fullPath}:${line} — malformed tag ${JSON.stringify(tag)} (tags must match ${VALID_TAG_PATTERN}; @cypress/grep matches tags literally, so typos silently never match)`,
          );
        }
      }
    }

    const blocks = splitTopLevelBlocks(content);

    blocks.forEach((block) => {
      if (!QA_DB_USAGE_PATTERN.test(block.text)) {
        return;
      }

      // Usage inside a top-level describe requires a tag within that
      // describe. Usage in shared helpers outside any describe is fine as
      // long as the file is tagged somewhere (its callers are describes).
      const scope = block.isDescribe ? block.text : content;
      if (!QA_DB_TAGS_PATTERN.test(scope)) {
        problems.push(
          `${fullPath}:${block.line} — QA database usage without a routing tag`,
        );
      }
    });
  });

  if (problems.length) {
    console.error(
      chalk.red(
        "\nFound Cypress specs that use QA databases without a routing tag (or with a malformed tag):\n\n",
      ) + problems.join("\n"),
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
  // Will match all files in the scenarios dir (at any depth), except the
  // ones in helpers and shared directories
  return glob.sync(`${E2E_HOME}**/*.{js,ts}`, {
    ignore: ["**/helpers/**", "**/shared/**"],
  });
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
