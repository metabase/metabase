const fs = require("fs");

const { printBold, printCyan } = require("./cypress-runner-utils.js");

const getVersion = async () => {
  try {
    const version = fs.readFileSync(
      __dirname + "/../../resources/version.properties",
    );

    printBold("Running e2e test runner with this build:");
    printCyan(version);

    printBold(
      "If that version seems too old, please run `./bin/build.sh :steps '[:version :uberjar]'`.",
    );
  } catch (e) {
    printBold(
      "No version file found. Please run `./bin/build.sh :steps '[:version :uberjar]'`.",
    );

    process.exit(1);
  }
};

module.exports = getVersion;
