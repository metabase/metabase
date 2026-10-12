import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

import { findEnvRoot } from "../data-app-dev/config/find-env-root";
import {
  DATA_APP_MB_API_KEY_ENV,
  DATA_APP_MB_URL_ENV,
} from "../data-app-dev/constants/env";

function readEnvFile(filePath: string) {
  return fs.existsSync(filePath)
    ? parseEnv(fs.readFileSync(filePath, "utf8"))
    : {};
}

/** The Metabase instance and API key the dev preview uses: the repo-root `.env.local`, overridden by the environment. */
export function getMetabaseCredentials(appRoot: string) {
  const values = {
    ...readEnvFile(path.join(findEnvRoot(appRoot), ".env.local")),
    ...process.env,
  };
  const metabaseUrl = values[DATA_APP_MB_URL_ENV];
  const apiKey = values[DATA_APP_MB_API_KEY_ENV];

  if (!metabaseUrl || !apiKey) {
    throw new Error(
      `${DATA_APP_MB_URL_ENV} and ${DATA_APP_MB_API_KEY_ENV} must be set, in the repo-root .env.local or the environment.`,
    );
  }

  return { metabaseUrl: metabaseUrl.replace(/\/+$/, ""), apiKey };
}
