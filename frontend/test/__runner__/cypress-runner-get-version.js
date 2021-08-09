const { printBold, printCyan, readFile } = require("./cypress-runner-utils.js");

const getVersion = async () => {
  try {
    const version = await readFile(
      __dirname + "/../../../resources/version.properties",
    );

    printBold("Running e2e test runner with this build:");
    printCyan(version);

    printBold(
      "If that version seems too old, please run `./bin/build version uberjar`.",
    );
  } catch (e) {
    printBold(
      "No version file found. Please run `./bin/build version uberjar`.",
    );

    process.exit(1);
  }
};

module.exports = getVersion;
