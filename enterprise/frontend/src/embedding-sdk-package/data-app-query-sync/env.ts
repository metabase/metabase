import fs from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

import { findEnvRoot } from "../data-app-dev/config/find-env-root";

function parseEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  return parseEnv(fs.readFileSync(filePath, "utf8"));
}

export function getQuerySyncCredentials(appRoot: string) {
  const values = {
    ...parseEnvFile(path.join(findEnvRoot(appRoot), ".env.local")),
    ...process.env,
  };
  const metabaseUrl = values.DATA_APP_MB_URL;
  const apiKey = values.DATA_APP_MB_API_KEY;
  if (!metabaseUrl || !apiKey) {
    throw new Error(
      "DATA_APP_MB_URL and DATA_APP_MB_API_KEY must be set in .env.local.",
    );
  }
  return { metabaseUrl, apiKey };
}
