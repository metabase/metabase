const CypressBackend = require("./cypress-runner-backend");
const generateSnapshots = require("./cypress-runner-generate-snapshots");
const runCypress = require("./cypress-runner-run-tests");
const { printBold } = require("./cypress-runner-utils");
const mode = process.argv[2];

const startServer = async () => {
  printBold("Starting backend");
  await CypressBackend.start();
};

const snapshot = async () => {
  printBold("Generating snapshots");
  await generateSnapshots();
};

const runTests = async () => {
  printBold("Running Cypress Tests");
  await runCypress(exitCode => process.exit(exitCode));
};

if (mode === "start") {
  startServer();
}

if (mode === "snapshot") {
  snapshot();
}

if (mode === "test") {
  runTests();
}
