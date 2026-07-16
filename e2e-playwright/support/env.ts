import fs from "fs";
import path from "path";

// Cypress auto-loads the gitignored repo-root cypress.env.json (premium
// tokens, snowplow config, …). Read the same file so EE tests get the same
// environment. Values already present in the environment win. (Note: the
// repo-root .env exists too, but its token values are stale — don't use it.)
const cypressEnvPath = path.resolve(__dirname, "../../cypress.env.json");
if (fs.existsSync(cypressEnvPath)) {
  const cypressEnv: Record<string, unknown> = JSON.parse(
    fs.readFileSync(cypressEnvPath, "utf8"),
  );
  for (const [key, value] of Object.entries(cypressEnv)) {
    if (typeof value === "string" && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

const BACKEND_HOST = process.env.BACKEND_HOST ?? "localhost";
const BACKEND_PORT =
  process.env.BACKEND_PORT ?? process.env.MB_JETTY_PORT ?? "4000";

export const BASE_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}`;
