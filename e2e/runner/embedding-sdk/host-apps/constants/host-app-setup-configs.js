import { BACKEND_PORT } from "../../../constants/backend-port.js";

const BASE_ENV = {
  WATCH: process.env.HOST_APP_ENVIRONMENT === "development" ? "true" : "false",
  MB_PORT: BACKEND_PORT,
  CLIENT_PORT: 4400,
};

const BASE_SETUP_CONFIG = {
  "docker-up-command": "yarn docker:up",
  "docker-down-command": "yarn docker:down",
  env: BASE_ENV,
  cypressEnv: {
    CLIENT_PORT: BASE_ENV.CLIENT_PORT,
  },
};

export const HOST_APP_SETUP_CONFIGS = {
  "vite-5-host-app-e2e": {
    ...BASE_SETUP_CONFIG,
    appName: "vite-5-host-app",
  },
  "nextjs-host-app-e2e": {
    ...BASE_SETUP_CONFIG,
    appName: "nextjs-host-app",
    env: {
      WATCH: BASE_ENV.WATCH,
      PREMIUM_EMBEDDING_TOKEN: BASE_ENV.PREMIUM_EMBEDDING_TOKEN,
      MB_PORT: BASE_ENV.MB_PORT,
      CLIENT_PORT_APP_ROUTER: BASE_ENV.CLIENT_PORT,
      CLIENT_PORT_PAGES_ROUTER: BASE_ENV.CLIENT_PORT + 1,
    },
    cypressEnv: {
      CLIENT_PORT_APP_ROUTER: BASE_ENV.CLIENT_PORT,
      CLIENT_PORT_PAGES_ROUTER: BASE_ENV.CLIENT_PORT + 1,
    },
  },
};
