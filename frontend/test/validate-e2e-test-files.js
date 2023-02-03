#!/usr/bin/env node
const { execSync } = require("child_process");

const path = require("path");
const glob = require("glob");

const e2eHome = "frontend/test/metabase/scenarios/";
const e2eFileExtension = ".cy.spec.js";

const stagedFiles = execSync("git diff HEAD --name-only", { encoding: "utf8" });
const relevantStagedFiles = stagedFiles.includes(e2eHome);

if (relevantStagedFiles) {
  // Will match all files in the scenarios dir, except the helpers
  const PATTERN = "frontend/test/metabase/scenarios/*/{*.js,!(helpers)/*.js}";

  const invalidFileNames = glob.sync(PATTERN).filter(fullPath => {
    const basename = path.basename(fullPath);
    return !basename.endsWith(e2eFileExtension);
  });

  if (invalidFileNames.length > 0) {
    console.error(
      `\nFound Cypress files not ending with '${e2eFileExtension}':\n\n` +
        invalidFileNames.join("\n"),
    );

    return 1;
  }

  return 0;
} else {
  return 0;
}
