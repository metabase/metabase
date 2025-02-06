const CypressBackend = require("./cypress-runner-backend");
const runCypress = require("./cypress-runner-run-tests");
const { printBold } = require("./cypress-runner-utils");

const mode = process.argv?.[2]?.trim();

const availableModes = ["start", "snapshot", "e2e", "component"];

if (!availableModes.includes(mode)) {
  console.error(`Invalid mode: ${mode}`);
  process.exit(1);
}

const startServer = async () => {
  printBold("Starting backend");
  await CypressBackend.start();
};

const runTests = async suite => {
  printBold(`Running ${suite} Cypress Tests`);
  await runCypress(suite, process.exit);
};

if (mode === "start") {
  startServer();
} else {
  runTests(mode);
}
