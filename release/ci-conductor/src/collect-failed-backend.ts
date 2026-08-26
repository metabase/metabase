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
// LIMITATION — full-suite fallback. hawk ties most failures to a test var and
// writes them as a `<testcase>` carrying the namespace as `classname`. A
// var-less error (a fixture or namespace-load failure) goes to
// `mb_hawk_var_less_errors.xml` with no `classname`, so it parses namespace-less
// and there is no `ns/var` to name it by. A confident, narrow rerun is therefore
// only possible when every failure is attributable to a var.
// This collector therefore writes the selector file ONLY when it found at least
// one failure and every one carries a namespace + name. Otherwise (nothing
// parsed, or any failure missing its namespace) it leaves no file behind —
// clearing any set the caller restored from a previous attempt — and the caller,
// seeing no file, reruns the whole suite. "Narrow only when certain; otherwise
// rerun everything."
//
// Run directly with bun (no build step):  bun src/collect-failed-backend.ts

import { rmSync, writeFileSync } from "node:fs";

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
    // On a rerun this path already holds the PREVIOUS attempt's set, restored by
    // the caller for the test step to read. "No confident set" has to mean "no
    // file", or that stale set is what gets uploaded and narrowed on next time.
    rmSync(OUTPUT_FILE, { force: true });
    log(`not writing ${OUTPUT_FILE}: no confident failed-test set — caller should rerun the full suite`);
    return;
  }
  writeFileSync(OUTPUT_FILE, vector);
  log(`wrote ${OUTPUT_FILE}: ${vector}`);
}

if (import.meta.main) {
  main();
}
