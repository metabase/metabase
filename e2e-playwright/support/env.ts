import fs from "fs";
import path from "path";

// Token/config sources, in precedence order: real environment variables win;
// then the gitignored repo-root .env (the CURRENT convention for premium
// tokens — 2026-07-22, per Fraser); then cypress.env.json as a legacy
// fallback for older checkouts. (This inverts the earlier "cypress.env.json
// is the source of truth, .env is stale" note, which was true when written
// and no longer is.)
const dotenvPath = path.resolve(__dirname, "../../.env");
if (fs.existsSync(dotenvPath)) {
  for (const line of fs.readFileSync(dotenvPath, "utf8").split("\n")) {
    // Tolerant of `KEY=value`, `KEY = value`, and `export KEY=value`.
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(
      line,
    );
    if (!match || line.trim().startsWith("#")) {
      continue;
    }
    const [, key, raw] = match;
    const value = raw.trim().replace(/^(['"])(.*)\1$/, "$2");
    if (value !== "" && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

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
