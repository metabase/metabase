const { FAILURE_EXIT_CODE } = require("./constants/exit-code");
const CypressBackend = require("./cypress-runner-backend");
const runCypress = require("./cypress-runner-run-tests");
const { printBold } = require("./cypress-runner-utils");

const modeOrTestSuite = process.argv?.[2]?.trim();

const availableModes = ["start", "snapshot"];
const availableTestSuites = [
  "e2e",
  "component",
  "metabase-nodejs-react-sdk-embedding-sample-e2e",
  "metabase-nextjs-sdk-embedding-sample-e2e",
  "shoppy-e2e",
];

if (
  !availableModes.includes(modeOrTestSuite) &&
  !availableTestSuites.includes(modeOrTestSuite)
) {
  console.error(`Invalid mode or test suite: ${modeOrTestSuite}`);
  process.exit(FAILURE_EXIT_CODE);
}

const startServer = async () => {
  printBold("Starting backend");
  await CypressBackend.start();
};

const runTests = async (testSuite) => {
  printBold(`Running ${testSuite} Cypress Tests`);
  await runCypress(testSuite, process.exit);
};

if (modeOrTestSuite === "start") {
  startServer();
} else {
  runTests(modeOrTestSuite);
}
