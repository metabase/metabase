export const SAMPLE_APP_SETUP_CONFIGS = {
  "metabase-nodejs-react-sdk-embedding-sample": {
    "docker-compose-path": "./docker-compose.e2e.yml",
    branch: "docker-e2e-testing",
    env: {
      PREMIUM_EMBEDDING_TOKEN: process.env.CYPRESS_ALL_FEATURES_TOKEN ?? "",
      MB_PORT: 4300,
      CLIENT_PORT: 4400,
      AUTH_PROVIDER_PORT: 4500,
    },
  },
  "metabase-nextjs-sdk-embedding-sample": {
    "docker-compose-path": "./docker-compose.e2e.yml",
    branch: "docker-e2e-testing",
    env: {
      PREMIUM_EMBEDDING_TOKEN: process.env.CYPRESS_ALL_FEATURES_TOKEN ?? "",
      MB_PORT: 4301,

      CLIENT_PORT_APP_ROUTER: 4401,
      AUTH_PROVIDER_PORT_APP_ROUTER: 4501,

      CLIENT_PORT_PAGES_ROUTER: 4401,
      AUTH_PROVIDER_PORT_PAGES_ROUTER: 4501,
    },
  },
  shoppy: {
    "docker-compose-path": "./docker-compose.e2e.yml",
    branch: "docker-e2e-testing",
    env: {
      PREMIUM_EMBEDDING_TOKEN: process.env.CYPRESS_ALL_FEATURES_TOKEN ?? "",
      MB_PORT: 4303,
      CLIENT_PORT: 4403,
      AUTH_PROVIDER_PORT: 4503,
    },
  },
};
