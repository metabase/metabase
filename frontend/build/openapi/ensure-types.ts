#!/usr/bin/env bun
/**
 * Ensures generated API types (frontend/src/metabase-types/openapi/) exist,
 * as fresh as cheaply possible.
 *
 * Fallback chain:
 *   1. Running backend (GET /api/docs/openapi.json)  -> fresh spec in ~2s
 *   2. Existing generated types on disk              -> keep, warn (stale ok locally; CI is the accurate gate)
 *   3. Existing spec file on disk                    -> regenerate types from it, warn
 *   4. Cold start: generate spec via Clojure CLI     -> ~40s, once per fresh checkout; skipped in --tolerant mode
 *   5. No JVM toolchain available:
 *        default    -> exit 1
 *        --tolerant -> warn, exit 0 (postinstall must not fail in JVM-less contexts)
 *
 * --tolerant also skips everything when types already exist, keeping
 * `bun install` fast; freshness is handled by dev / type-check entry points.
 *
 * A *failed* generation (broken Malli schema) is a real error in both modes —
 * tolerant only covers a missing toolchain.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const SPEC_PATH = ".tmp/openapi/openapi.json";
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
  log(
    "⚠ no generated API types yet — skipping the ~40s cold-start generation in tolerant mode. They will be generated on the first `bun run dev` / `bun run type-check` (or run `bun run types:ensure` manually).",
  );
  process.exit(0);
}

const clojureAvailable =
  spawnSync("clojure", ["--version"], { stdio: "ignore" }).status === 0;

if (!clojureAvailable) {
  if (tolerant) {
    log(
      "⚠ Clojure CLI not available — skipping API types generation. Code importing metabase-types/openapi will not type-check until `bun run types:ensure` runs with a JVM available.",
    );
    process.exit(0);
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
