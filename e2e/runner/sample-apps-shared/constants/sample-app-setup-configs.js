const BRANCH_NAME = "docker-e2e-testing";

const BASE_ENV = {
  PREMIUM_EMBEDDING_TOKEN: process.env.CYPRESS_ALL_FEATURES_TOKEN ?? "",
  MB_PORT: 4300,
  CLIENT_PORT: 4400,
  BACKEND_PORT: 4500,
};

const BASE_SETUP_CONFIG = {
  "docker-up-command": "yarn docker:e2e:up",
  "docker-down-command": "yarn docker:e2e:down",
  "docker-env-example-path": ".env.docker.example",
  "docker-env-path": ".env.docker",
  branch: BRANCH_NAME,
  env: BASE_ENV,
};

export const SAMPLE_APP_SETUP_CONFIGS = {
  "metabase-nodejs-react-sdk-embedding-sample-e2e": {
    ...BASE_SETUP_CONFIG,
    appName: "metabase-nodejs-react-sdk-embedding-sample",
  },
  "metabase-nextjs-sdk-embedding-sample-app-router-e2e": {
    ...BASE_SETUP_CONFIG,
    appName: "metabase-nextjs-sdk-embedding-sample",
    subAppName: "next-sample-app-router",
    env: {
      PREMIUM_EMBEDDING_TOKEN: BASE_ENV.PREMIUM_EMBEDDING_TOKEN,
      MB_PORT: BASE_ENV.MB_PORT,
      CLIENT_PORT_APP_ROUTER: BASE_ENV.CLIENT_PORT,
      BACKEND_PORT_APP_ROUTER: BASE_ENV.BACKEND_PORT,
    },
  },
  "metabase-nextjs-sdk-embedding-sample-pages-router-e2e": {
    ...BASE_SETUP_CONFIG,
    appName: "metabase-nextjs-sdk-embedding-sample",
    subAppName: "next-sample-pages-router",
    env: {
      PREMIUM_EMBEDDING_TOKEN: BASE_ENV.PREMIUM_EMBEDDING_TOKEN,
      MB_PORT: BASE_ENV.MB_PORT,
      CLIENT_PORT_PAGES_ROUTER: BASE_ENV.CLIENT_PORT,
      BACKEND_PORT_PAGES_ROUTER: BASE_ENV.BACKEND_PORT,
    },
  },
  "shoppy-e2e": {
    ...BASE_SETUP_CONFIG,
    appName: "shoppy",
  },
};
