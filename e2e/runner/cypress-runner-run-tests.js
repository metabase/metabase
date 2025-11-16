const cypress = require("cypress");

const { BACKEND_PORT } = require("./constants/backend-port");
const { FAILURE_EXIT_CODE } = require("./constants/exit-code");
const { parseArguments } = require("./cypress-runner-utils");
const {
  HOST_APP_SETUP_CONFIGS,
} = require("./embedding-sdk/host-apps/constants/host-app-setup-configs");
const {
  SAMPLE_APP_SETUP_CONFIGS,
} = require("./embedding-sdk/sample-apps/constants/sample-app-setup-configs");

const getHost = (port = BACKEND_PORT) => `http://localhost:${port}`;

const getEmbeddingSdkAppE2eConfig = ({
  baseUrl,
  env,
  project,
  specPattern,
}) => {
  process.env = {
    ...process.env,
    ...env,
  };

  return {
    project,
    configFile: "e2e/support/cypress.config.js",
    config: {
      baseUrl,
      specPattern,
      env,
    },
    testingType: "e2e",
  };
};

const getSampleAppE2eConfig = (suite) => ({
  [suite]: () => {
    const { appName, env } = SAMPLE_APP_SETUP_CONFIGS[suite];
    const { CLIENT_PORT } = env;

    return getEmbeddingSdkAppE2eConfig({
      // If the `clientPort` is not set, it means we have multiple apps running on different ports,
      // so we control the `baseUrl` based on other `env` variables on the Sample App tests level.
      baseUrl: CLIENT_PORT ? getHost(CLIENT_PORT) : "",
      env,
      project: ["e2e/tmp", appName].join("/"),
    });
  },
});

const getHostAppE2eConfig = (suite) => ({
  [suite]: () => {
    const { appName, env } = HOST_APP_SETUP_CONFIGS[suite];

    return getEmbeddingSdkAppE2eConfig({
      baseUrl: getHost(),
      env,
      specPattern: [
        "e2e/test-host-app/shared/**/*.cy.spec.{js,ts}",
        ["e2e/test-host-app", appName, "**/*.cy.spec.{js,ts}"].join("/"),
      ],
    });
  },
});

// This is a map of all possible Cypress configurations we can run.
const configs = {
  e2e: () => {
    return {
      configFile: "e2e/support/cypress.config.js",
      testingType: "e2e",
    };
  },
  ...getSampleAppE2eConfig("metabase-nodejs-react-sdk-embedding-sample-e2e"),
  ...getSampleAppE2eConfig("metabase-nextjs-sdk-embedding-sample-e2e"),
  ...getSampleAppE2eConfig("shoppy-e2e"),
  ...getHostAppE2eConfig("vite-6-host-app-e2e"),
  ...getHostAppE2eConfig("next-15-app-router-host-app-e2e"),
  ...getHostAppE2eConfig("next-15-pages-router-host-app-e2e"),
  ...getHostAppE2eConfig("angular-20-host-app-e2e"),
  snapshot: () => {
    process.env.OPEN_UI = false;

    return {
      configFile: "e2e/support/cypress-snapshots.config.js",
      testingType: "e2e",
    };
  },
  component: () => {
    return {
      configFile: "e2e/support/cypress-embedding-sdk-component-test.config.js",
      testingType: "component",
    };
  },
};

/**
 * This simply runs cypress through the Cypress Module API rather than the CLI.
 * See: https://docs.cypress.io/app/references/module-api
 */
const runCypress = async (suite = "e2e", { exitFunction, cliArguments }) => {
  if (!configs[suite]) {
    console.error(
      `Invalid suite: ${suite}, try one of: ${Object.keys(configs)}`,
    );
    await exitFunction(FAILURE_EXIT_CODE);
  }

  const config = configs[suite]();
  const userArgs = await parseArguments(cliArguments);
  const runOptions = { ...config, ...userArgs };

  const openMode = process.env.OPEN_UI === "true";

  try {
    const { status, message, totalFailed, failures } = openMode
      ? await cypress.open(runOptions)
      : await cypress.run(runOptions);

    // At least one test failed
    if (totalFailed > 0) {
      await exitFunction(FAILURE_EXIT_CODE);
    }

    // Something went wrong and Cypress failed to even run tests
    if (status === "failed" && failures) {
      console.error(message);

      await exitFunction(failures);
    }
  } catch (e) {
    console.error("Failed to run Cypress!\n", e);

    await exitFunction(FAILURE_EXIT_CODE);
  }
};

module.exports = runCypress;
