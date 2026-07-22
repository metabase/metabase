#!/usr/bin/env bun

// Backend granular-rerun collector. Runs as a post-test CI step after a failed
// backend/driver run: scan the JUnit hawk just wrote and emit the failed test
// vars as a hawk `:only` selector so a rerun runs only those, not the whole
// suite (e.g. one failed Snowflake test instead of 45 minutes of them). Mirrors
// the Cypress `collectFailedTests` recorder (`e2e/support/collectFailedTests.js`).
//
// Reuses the backend JUnit adapter (`normalizeBackendJunit`) — the same parser
// the ci-conductor failure reporter uses — so there is no second XML parser to
// keep in sync.
//
// LIMITATION — full-suite fallback. hawk only writes a `<testcase>` for a
// failure it can tie to a test var; a var-less error (a fixture or
// namespace-load failure) leaves no trace in the JUnit XML. So a confident,
// narrow rerun is only possible when every failure is attributable to a var.
// This collector therefore writes the selector file ONLY when it found at least
// one failure and every one carries a namespace + name. Otherwise (nothing
// parsed, or any failure missing its namespace) it writes nothing, and the
// caller — seeing no file — reruns the whole suite. "Narrow only when certain;
// otherwise rerun everything."
//
// Run directly with bun (no build step):  bun src/collect-failed-backend.ts

import { writeFileSync } from "node:fs";

import type { NormalizedTest } from "./contract.ts";
import { normalizeBackendJunit } from "./adapters/backend.ts";
import { log } from "./util.ts";

// hawk `:only` accepts a vector of `ns/var` symbols, so the file contents can be
// passed straight through:  clojure -X ... :only "$(cat target/failed-tests)"
const OUTPUT_FILE = process.env.FAILED_TESTS_FILE || "target/failed-tests";

/** `ns/var` selector for one failing test, or null if it can't be attributed. */
function selector(test: NormalizedTest): string | null {
  const ns = (test.path || "").trim();
  const name = (test.name || "").trim();
  return ns && name ? `${ns}/${name}` : null;
}

/**
 * Build the hawk `:only` vector for a set of parsed failures, or null to signal
 * "rerun the full suite". Null when there are no failures, or when any failure
 * can't be attributed to a namespace (untrustworthy set — see the file header).
 * Pure, so it's the unit-tested core the entrypoint wraps.
 */
export function buildOnlySelector(failures: NormalizedTest[]): string | null {
  const selectors = failures.map(selector);
  const certain = selectors.length > 0 && selectors.every((s) => s !== null);
  if (!certain) {
    return null;
  }
  const unique = [...new Set(selectors as string[])].sort();
  return `[${unique.join(" ")}]`;
}

function main(): void {
  log("backend granular-rerun collector starting");
  const vector = buildOnlySelector(normalizeBackendJunit());
  if (vector === null) {
    log(`not writing ${OUTPUT_FILE}: no confident failed-test set — caller should rerun the full suite`);
    return;
  }
  writeFileSync(OUTPUT_FILE, vector);
  log(`wrote ${OUTPUT_FILE}: ${vector}`);
}

if (import.meta.main) {
  main();
}
