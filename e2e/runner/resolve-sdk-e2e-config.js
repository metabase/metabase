const { BACKEND_PORT } = require("./constants/backend-port");
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
    const { env } = HOST_APP_SETUP_CONFIGS[suite];

    return getEmbeddingSdkAppE2eConfig({
      baseUrl: getHost(),
      env,
      specPattern: "e2e/test-host-app/shared/**/*.cy.spec.{js,ts}",
    });
  },
});

// This is a map of all possible custom SDK configurations we can run.
const configs = {
  ...getSampleAppE2eConfig("metabase-nodejs-react-sdk-embedding-sample-e2e"),
  ...getSampleAppE2eConfig("metabase-nextjs-sdk-embedding-sample-e2e"),
  ...getSampleAppE2eConfig("shoppy-e2e"),
  ...getHostAppE2eConfig("vite-6-host-app-e2e"),
  ...getHostAppE2eConfig("next-15-app-router-host-app-e2e"),
  ...getHostAppE2eConfig("next-15-pages-router-host-app-e2e"),
  ...getHostAppE2eConfig("angular-20-host-app-e2e"),
};

const resolveSdkE2EConfig = (suite) => {
  if (!configs[suite]) {
    throw new Error(
      `Invalid suite: ${suite}, try one of: ${Object.keys(configs)}`,
    );
  }

  return configs[suite]();
};

module.exports = { resolveSdkE2EConfig };
