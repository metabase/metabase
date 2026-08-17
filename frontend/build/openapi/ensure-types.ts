#!/usr/bin/env bun
/**
 * Ensures generated API types (frontend/src/metabase-types/openapi/) exist,
 * as fresh as cheaply possible.
 * Runs in 2 modes:
 *   1. --tolerant (for postinstall) skips everything when types are already up to date
 *   2. strict mode: exits non-zero if types are not up to date
 *
 * Fallback chain:
 *   1. Running backend (GET /api/docs/openapi.json) — the only source reflecting
 *        uncommitted schema changes
 *   2. Existing types on disk —  unless the committed spec is newer (you
 *        just pulled someone else's API change)
 *   3. Committed spec under frontend/build/openapi/spec
 *   4. Nothing found -> --tolerant exits with 0 / strict exits with 1
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

const SPEC_PATH = ".tmp/openapi/openapi.json";
const SPLIT_SPEC_DIR = "frontend/build/openapi/spec";
const SPLIT_SPEC_PATH = `${SPLIT_SPEC_DIR}/openapi.json`;
const TYPES_PATH = "frontend/src/metabase-types/openapi/types.gen.d.ts";
const BACKEND_URL = `http://localhost:${process.env.MB_JETTY_PORT ?? 3000}/api/docs/openapi.json`;

const tolerant = process.argv.includes("--tolerant");

function log(message: string) {
  // eslint-disable-next-line no-console
  console.log(`[types:ensure] ${message}`);
}

function runScript(name: string): number {
  const result = spawnSync("bun", ["run", name], { stdio: "inherit" });
  return result.status ?? 1;
}

function newestModificationTime(dir: string): number {
  let newest = 0;
  const visit = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else {
        newest = Math.max(newest, statSync(path).mtimeMs);
      }
    }
  };
  visit(dir);
  return newest;
}

// Pulling someone else's API change rewrites files in the committed spec, which leaves
// them newer than the types generated before the pull.
function committedSpecIsNewerThanTypes(): boolean {
  if (!existsSync(SPLIT_SPEC_PATH) || !existsSync(TYPES_PATH)) {
    return false;
  }
  return newestModificationTime(SPLIT_SPEC_DIR) > statSync(TYPES_PATH).mtimeMs;
}

async function fetchSpecFromBackend(): Promise<boolean> {
  try {
    const response = await fetch(BACKEND_URL, {
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) {
      return false;
    }
    const body = await response.text();
    // sanity check: we got an OpenAPI document, not some other app on this port
    if (!("openapi" in JSON.parse(body))) {
      return false;
    }
    mkdirSync(dirname(SPEC_PATH), { recursive: true });
    writeFileSync(SPEC_PATH, body);
    return true;
  } catch {
    return false;
  }
}

// --tolerant runs from postinstall, where a non-zero exit fails `bun install` itself.
function finish(status: number): never {
  if (status !== 0 && tolerant) {
    log(
      "⚠ could not generate API types — run `bun run types:ensure` to see the failure",
    );
    process.exit(0);
  }
  process.exit(status);
}

function generateFromCommittedSpec(): never {
  log(
    "generating types from the committed spec (frontend/build/openapi/spec) — start the backend if you need types for schema changes on your branch",
  );
  const bundleStatus = runScript("openapi:bundle");
  return finish(
    bundleStatus === 0 ? runScript("types:generate") : bundleStatus,
  );
}

const typesExist = existsSync(TYPES_PATH);
const typesAreBehindCommittedSpec =
  typesExist && committedSpecIsNewerThanTypes();

if (tolerant && typesExist && !typesAreBehindCommittedSpec) {
  process.exit(0);
}

if (await fetchSpecFromBackend()) {
  log(`fetched OpenAPI spec from running backend (${BACKEND_URL})`);
  finish(runScript("types:generate"));
}

if (typesAreBehindCommittedSpec) {
  log("committed spec is newer than your generated types — refreshing from it");
  generateFromCommittedSpec();
}

if (typesExist) {
  log(
    "⚠ backend not running — keeping existing generated API types (may be stale; start the backend or re-run `bun run types:ensure` to refresh)",
  );
  process.exit(0);
}

if (existsSync(SPLIT_SPEC_PATH)) {
  generateFromCommittedSpec();
}

if (tolerant) {
  log(
    `⚠ no generated API types and no committed spec at ${SPLIT_SPEC_PATH} — they will be generated on the first \`bun run dev\` / \`bun run type-check\` (or run \`bun run types:ensure\` manually).`,
  );
  process.exit(0);
}

log(
  `error: no running backend, no existing types, and no committed spec at ${SPLIT_SPEC_PATH}`,
);
process.exit(1);
