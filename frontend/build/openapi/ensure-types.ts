#!/usr/bin/env bun
/**
 * Ensures generated API types (frontend/src/metabase-types/openapi/) exist,
 * as fresh as cheaply possible.
 *
 * Fallback chain:
 *   1. Running backend (GET /api/docs/openapi.json)  -> fresh spec in ~2s
 *   2. Existing generated types on disk              -> keep, warn (stale ok locally; CI is the accurate gate)
 *   3. Existing spec file on disk                    -> regenerate types from it, warn
 *   4. Cold start: generate spec via Clojure CLI     -> ~40s, once per fresh checkout
 *        (strict only; tolerant mode instead falls through to the
 *        docs/api.json fallback below)
 *   5. No JVM toolchain available -> fall back to committed docs/api.json
 *        (nightly-generated from master, ≤1 day stale) in both modes
 *   6. Nothing at all -> tolerant exit 0 / strict exit 1
 *
 * --tolerant also skips everything when types already exist, keeping
 * `bun install` fast; freshness is handled by dev / type-check entry points.
 *
 * A *failed* generation (broken Malli schema) is a real error in both modes —
 * tolerant only covers a missing toolchain.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const SPEC_PATH = ".tmp/openapi/openapi.json";
const DOCS_SPEC_PATH = "docs/api.json";
const TYPES_PATH = "frontend/src/metabase-types/openapi/types.gen.ts";
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

function applyDocsSpecFallback(): never {
  log(
    "⚠ using the committed docs/api.json as the spec source — it is nightly-generated from master (≤1 day stale, and missing any schema changes on your branch). A running backend or `bun run types:ensure` with a JVM gives accurate types.",
  );
  mkdirSync(dirname(SPEC_PATH), { recursive: true });
  copyFileSync(DOCS_SPEC_PATH, SPEC_PATH);
  process.exit(runScript("types:generate"));
}

const typesExist = existsSync(TYPES_PATH);

if (tolerant && typesExist) {
  process.exit(0);
}

if (await fetchSpecFromBackend()) {
  log(`fetched OpenAPI spec from running backend (${BACKEND_URL})`);
  process.exit(runScript("types:generate"));
}

if (typesExist) {
  log(
    "⚠ backend not running — keeping existing generated API types (may be stale; start the backend or re-run `bun run types:ensure` to refresh)",
  );
  process.exit(0);
}

if (existsSync(SPEC_PATH)) {
  log(
    "⚠ backend not running — generating types from existing spec file (may be stale)",
  );
  process.exit(runScript("types:generate"));
}

if (tolerant) {
  if (existsSync(DOCS_SPEC_PATH)) {
    applyDocsSpecFallback();
  }
  log(
    "⚠ no generated API types yet — skipping the ~40s cold-start generation in tolerant mode. They will be generated on the first `bun run dev` / `bun run type-check` (or run `bun run types:ensure` manually).",
  );
  process.exit(0);
}

const clojureAvailable =
  spawnSync("clojure", ["--version"], { stdio: "ignore" }).status === 0;

if (!clojureAvailable) {
  if (existsSync(DOCS_SPEC_PATH)) {
    applyDocsSpecFallback();
  }
  log(
    "error: no running backend, no existing types, and no Clojure CLI to generate the spec",
  );
  process.exit(1);
}

log(
  "no backend running and no existing types — generating OpenAPI spec from source (~40s, one-time per checkout)",
);
const generateStatus = runScript("openapi:generate");
if (generateStatus !== 0) {
  process.exit(generateStatus); // failed generation is fatal even with --tolerant
}
process.exit(runScript("types:generate"));
