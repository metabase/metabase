const CypressBackend = require("./cypress-runner-backend");
const runCypress = require("./cypress-runner-run-tests");
const { printBold } = require("./cypress-runner-utils");
const mode = process.argv[2];

const startServer = async () => {
  printBold("Starting backend");
  await CypressBackend.start();
};

const snapshot = async () => {
  printBold("Generating snapshots");
  await runCypress("snapshot");
};

const runTests = async () => {
  printBold("Running Cypress Tests");
  await runCypress("e2e");
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
