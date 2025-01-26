const CypressBackend = require("../runner/cypress-runner-backend");
const { printBold } = require("../runner/cypress-runner-utils");

const { setupContainer } = require("./setup-container");
const { runCommand } = require("./utils");

const command = process.argv[2];
const isCI = process.env["CYPRESS_CI"] === "true";

const server = CypressBackend.createServer();

const baseEnv = {
  MB_EDITION: process.env.MB_EDITION,
  // A special host name `host.docker.internal` allowing the connection from a container to a host
  E2E_HOST: "http://host.docker.internal:4000",
  CYPRESS_IS_VISUAL_TEST: "true",
  CYPRESS_ALL_FEATURES_TOKEN: process.env.CYPRESS_ALL_FEATURES_TOKEN,
  CYPRESS_NO_FEATURES_TOKEN: process.env.CYPRESS_NO_FEATURES_TOKEN,
};
const embeddingSdkEnv = {
  CYPRESS_IS_EMBEDDING_SDK: "true",
  NODE_OPTIONS: "--max-old-space-size=8196",
};
const updateVisualTestsEnv = {
  CYPRESS_DO_NOT_FAIL: "true",
};

const cypressFlags = [
  "--browser=/usr/bin/chromium",
  '--env grepTags="@visual",grepOmitFiltered=true',
].join(" ");
const cypressComponentTestingFlags = [
  "--component",
  "--config-file='e2e/support/cypress-embedding-sdk-component-test.config.js'",
].join(" ");

const optionsByCommand = {
  "cypress-run": {
    env: baseEnv,
    shouldStartServer: !isCI, // On CI the server is started as a separate step
    command: `node e2e/runner/run_cypress_ci.js test ${cypressFlags}`,
  },
  "cypress-run-component-sdk": {
    env: {
      ...baseEnv,
      ...embeddingSdkEnv,
    },
    shouldStartServer: true,
    command: `node e2e/runner/run_cypress_ci.js test ${cypressFlags} ${cypressComponentTestingFlags}`,
  },
  "cypress-update": {
    env: {
      ...baseEnv,
      ...updateVisualTestsEnv,
    },
    shouldStartServer: true,
    command: `node e2e/runner/run_cypress_ci.js test ${cypressFlags}`,
  },
  "cypress-update-component-sdk": {
    env: {
      ...baseEnv,
      ...embeddingSdkEnv,
      ...updateVisualTestsEnv,
    },
    shouldStartServer: true,
    command: `node e2e/runner/run_cypress_ci.js test ${cypressFlags} ${cypressComponentTestingFlags}`,
  },
};

async function runCypressVisualTests() {
  const options = optionsByCommand[command];

  if (options.prepare?.length) {
    for (const prepareCommand of options.prepare) {
      const [command, ...args] = prepareCommand.split(" ");

      await runCommand(command, args);
    }
  }

  if (options.shouldStartServer) {
    printBold("Starting backend");

    await CypressBackend.start(server);
  }

  await setupContainer(options);
}

runCypressVisualTests();
