import fs from "node:fs";
import path from "node:path";

import { findEnvRoot } from "../data-app-dev/config/find-env-root";

function parseEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  return Object.fromEntries(
    fs
      .readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        const key = line.slice(0, separator).trim();
        const value = line
          .slice(separator + 1)
          .trim()
          .replace(/^(['"])(.*)\1$/, "$2");
        return [key, value];
      }),
  );
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
