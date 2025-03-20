const BRANCH_NAME = "main"; // Affects the `local` testing only. On CI is passed as an ENV variable.

const BASE_ENV = {
  PREMIUM_EMBEDDING_TOKEN: process.env.CYPRESS_ALL_FEATURES_TOKEN ?? "",
  MB_PORT: 4300,
  CLIENT_PORT: 4400,
  AUTH_PROVIDER_PORT: 4500,
};

const BASE_SETUP_CONFIG = {
  "docker-up-command": "yarn docker:up",
  "docker-down-command": "yarn docker:down",
  "docker-env-example-path": ".env.docker.example",
  "docker-env-path": ".env.docker",
  defaultBranch: BRANCH_NAME,
  env: BASE_ENV,
};

export const SAMPLE_APP_SETUP_CONFIGS = {
  "metabase-nodejs-react-sdk-embedding-sample-e2e": {
    ...BASE_SETUP_CONFIG,
    appName: "metabase-nodejs-react-sdk-embedding-sample",
  },
  "metabase-nextjs-sdk-embedding-sample-e2e": {
    ...BASE_SETUP_CONFIG,
    appName: "metabase-nextjs-sdk-embedding-sample",
    env: {
      PREMIUM_EMBEDDING_TOKEN: BASE_ENV.PREMIUM_EMBEDDING_TOKEN,
      MB_PORT: BASE_ENV.MB_PORT,
      CLIENT_PORT_APP_ROUTER: BASE_ENV.CLIENT_PORT,
      CLIENT_PORT_PAGES_ROUTER: BASE_ENV.CLIENT_PORT + 1,
    },
  },
  "shoppy-e2e": {
    ...BASE_SETUP_CONFIG,
    appName: "shoppy",
  },
};
