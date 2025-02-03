const CypressBackend = require("./cypress-runner-backend");
const generateSnapshots = require("./cypress-runner-generate-snapshots");
const runCypress = require("./cypress-runner-run-tests");
const { printBold } = require("./cypress-runner-utils");
const mode = process.argv[2];

const baseUrl = process.env["E2E_HOST"] ?? "http://localhost:4000";

const startServer = async () => {
  const server = CypressBackend.createServer();
  printBold("Starting backend");
  await CypressBackend.start(server);
};

const snapshot = async () => {
  printBold("Generating snapshots");
  await generateSnapshots(baseUrl);
};

const runTests = async () => {
  printBold("Running Cypress Tests");
  await runCypress(baseUrl, exitCode => process.exit(exitCode));
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
