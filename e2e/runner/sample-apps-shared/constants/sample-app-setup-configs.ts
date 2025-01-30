import {
  AUTH_PROVIDER_URL,
  METABASE_INSTANCE_URL,
} from "../../../support/constants/embedding-sdk";
import { FAILURE_EXIT_CODE } from "../../constants/exit-code";
import { printBold } from "../../cypress-runner-utils";
import type { SampleAppSetupConfigs } from "../types";

export const SAMPLE_APP_SETUP_CONFIGS: SampleAppSetupConfigs = {
  "metabase-nodejs-react-sdk-embedding-sample": [
    {
      subAppName: "client",
      branch: "main",
      framework: "vite",
      env: {
        PORT: 4300,
        VITE_METABASE_INSTANCE_URL: METABASE_INSTANCE_URL,
        VITE_AUTH_PROVIDER_URI: AUTH_PROVIDER_URL,
      },
      startCommand: ["start", "--host"],
    },
  ],
  "metabase-nextjs-sdk-embedding-sample": [
    {
      subAppName: "next-sample-pages-router",
      branch: "main",
      framework: "next",
      env: {
        PORT: 4301,
        NEXT_PUBLIC_METABASE_INSTANCE_URL: METABASE_INSTANCE_URL,
        NEXT_PUBLIC_AUTH_PROVIDER_URI: AUTH_PROVIDER_URL,
      },
      startCommand: ["start"],
    },
    {
      subAppName: "next-sample-app-router",
      branch: "main",
      framework: "next",
      env: {
        PORT: 4302,
        NEXT_PUBLIC_METABASE_INSTANCE_URL: METABASE_INSTANCE_URL,
        NEXT_PUBLIC_AUTH_PROVIDER_URI: AUTH_PROVIDER_URL,
      },
      startCommand: ["start"],
    },
  ],
  shoppy: [
    {
      branch: "main",
      framework: "vite",
      env: {
        PORT: 4303,
        VITE_APP_API_HOST: "http://localhost:4304/api",
      },
      startCommand: ["preview", "--host"],
    },
    {
      subAppName: "api",
      branch: "main",
      framework: "none",
      env: {
        PORT: 4304,
        FRONTEND_URL: "http://localhost:4303",
        METABASE_JWT_SHARED_SECRET:
          process.env.CYPRESS_SHOPPY_METABASE_JWT_SHARED_SECRET ?? "",
        DB_URL: process.env.CYPRESS_SHOPPY_DB_URL ?? "",
      },
      startCommand: ["start"],
      beforeSetup: ({ appName, subAppName }) => {
        if (
          !process.env.CYPRESS_SHOPPY_METABASE_JWT_SHARED_SECRET ||
          !process.env.CYPRESS_SHOPPY_DB_URL
        ) {
          printBold(
            `⚠️ CYPRESS_SHOPPY_METABASE_JWT_SHARED_SECRET and CYPRESS_SHOPPY_DB_URL are required for testing ${appName}/${subAppName}.\n` +
              "Take it from `Shoppy - Environment File` entry in 1Password.",
          );
          process.exit(FAILURE_EXIT_CODE);
        }
      },
    },
  ],
};
