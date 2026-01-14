const { FAILURE_EXIT_CODE } = require("./constants/exit-code");
const runCypress = require("./cypress-node-js-runner");
const CypressBackend = require("./cypress-runner-backend");
const { parseArguments, printBold } = require("./cypress-runner-utils");
const { resolveSdkE2EConfig } = require("./resolve-sdk-e2e-config");

const command = process.argv?.[2]?.trim();
const cliArguments = process.argv.slice(3);

const availableModes = ["start", "snapshot"];
const availableTestingTypes = ["e2e", "component"];
const availableSDKTestSuites = [
  "metabase-nodejs-react-sdk-embedding-sample-e2e",
  "metabase-nextjs-sdk-embedding-sample-e2e",
  "shoppy-e2e",
  "vite-6-host-app-e2e",
  "next-15-app-router-host-app-e2e",
  "next-15-pages-router-host-app-e2e",
  "angular-20-host-app-e2e",
];

const permittedCommands = [
  ...availableModes,
  ...availableTestingTypes,
  ...availableSDKTestSuites,
];

if (!permittedCommands.includes(command)) {
  console.error(`Invalid command: ${command}`);
  process.exit(FAILURE_EXIT_CODE);
}

const startServer = async () => {
  printBold("Starting backend");
  await CypressBackend.runFromJar();
};

const runTests = async (config, cliArguments = []) => {
  const userOverrides = await parseArguments(cliArguments);
  await runCypress({ ...config, ...userOverrides });
};

// Custom "modes"
if (command === "start") {
  startServer();
}

if (command === "snapshot") {
  runTests(
    { configFile: "e2e/support/cypress-snapshots.config.js" },
    cliArguments,
  );
}

// Metabase component or e2e tests
if (command === "component") {
  runTests(
    {
      configFile: "e2e/support/cypress-embedding-sdk-component-test.config.js",
      testingType: "component",
    },
    cliArguments,
  );
}

if (command === "e2e") {
  runTests({ configFile: "e2e/support/cypress.config.js" }, cliArguments);
}

// Custom SDK Host/Sample App e2e tests
if (availableSDKTestSuites.includes(command)) {
  const config = resolveSdkE2EConfig(command);
  runTests(config);
}
