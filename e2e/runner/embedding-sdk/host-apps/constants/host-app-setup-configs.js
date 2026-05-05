import { BACKEND_PORT } from "../../../constants/backend-port.js";

const BASE_ENV = {
  WATCH: process.env.HOST_APP_ENVIRONMENT === "development" ? "true" : "false",
  MB_PORT: BACKEND_PORT,
  CLIENT_PORT: 4400,
};

const BASE_SETUP_CONFIG = {
  "app-run-command": "bun start",
  "app-down-command": `kill -9 $(lsof -ti:"${BASE_ENV.CLIENT_PORT}");`,
  env: BASE_ENV,
  cypressEnv: {
    PORT: BASE_ENV.CLIENT_PORT,
  },
};

export const HOST_APP_SETUP_CONFIGS = {
  "vite-6-host-app-e2e": {
    ...BASE_SETUP_CONFIG,
    appName: "vite-6-host-app",
    env: {
      ...BASE_ENV,
      VITE_MB_PORT: BASE_ENV.MB_PORT,
    },
  },
  "next-15-app-router-host-app-e2e": {
    ...BASE_SETUP_CONFIG,
    appName: "next-15-app-router-host-app",
    env: {
      ...BASE_ENV,
      NEXT_PUBLIC_MB_PORT: BASE_ENV.MB_PORT,
    },
  },
  "next-15-pages-router-host-app-e2e": {
    ...BASE_SETUP_CONFIG,
    appName: "next-15-pages-router-host-app",
    env: {
      ...BASE_ENV,
      NEXT_PUBLIC_MB_PORT: BASE_ENV.MB_PORT,
    },
  },
  "angular-20-host-app-e2e": {
    ...BASE_SETUP_CONFIG,
    appName: "angular-20-host-app",
    env: {
      ...BASE_ENV,
      NG_APP_MB_PORT: BASE_ENV.MB_PORT,
    },
  },
};
