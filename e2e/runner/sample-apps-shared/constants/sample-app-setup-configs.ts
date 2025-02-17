import {
  AUTH_PROVIDER_URL,
  METABASE_INSTANCE_URL,
} from "../../../support/constants/embedding-sdk";
import { applyNextJsAdjustments } from "../helpers/apply-nextjs-adjustments";
import type { SampleAppSetupConfigs } from "../types";

export const SAMPLE_APP_SETUP_CONFIGS: SampleAppSetupConfigs = {
  "metabase-nodejs-react-sdk-embedding-sample": [
    {
      subAppName: "client",
      branch: "main",
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
      env: {
        PORT: 4301,
        NEXT_PUBLIC_METABASE_INSTANCE_URL: METABASE_INSTANCE_URL,
        NEXT_PUBLIC_AUTH_PROVIDER_URI: AUTH_PROVIDER_URL,
      },
      additionalSetup: applyNextJsAdjustments,
      startCommand: ["start"],
    },
    {
      subAppName: "next-sample-app-router",
      branch: "main",
      env: {
        PORT: 4302,
        NEXT_PUBLIC_METABASE_INSTANCE_URL: METABASE_INSTANCE_URL,
        NEXT_PUBLIC_AUTH_PROVIDER_URI: AUTH_PROVIDER_URL,
      },
      additionalSetup: applyNextJsAdjustments,
      startCommand: ["start"],
    },
  ],
  shoppy: [
    {
      branch: "main",
      env: {
        PORT: 4303,
        // We have to reset API host for tests
        VITE_APP_API_HOST: "",
        VITE_APP_METABASE_INSTANCE_URL: METABASE_INSTANCE_URL,
        VITE_APP_AUTH_PROVIDER_URI: AUTH_PROVIDER_URL,
      },
      startCommand: ["preview", "--host"],
    },
  ],
};
