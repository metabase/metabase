// Backend (Clojure/hawk) adapter: hawk's JUnit XML → NormalizedTest[].
//
// hawk always writes JUnit XML to `target/junit/`, so the backend "collector"
// is a post-run scan of that artifact (one runner, one artifact, covering both
// the backend and driver CI paths). The XML parsing itself is shared
// (`../junit.ts`); this owns the backend-specific parts — hawk's `*_test.xml`
// file layout — while the suite label is supplied by the entrypoint.

import { readFileSync } from "node:fs";

import type { NormalizedTest } from "../contract.ts";
import { findJunitFiles, parseJunit } from "../junit.ts";
import { log } from "../util.ts";

const JUNIT_DIR = process.env.JUNIT_DIR || "target/junit";

// hawk names its per-namespace JUnit files `*_test.xml`, plus one fixed-name
// file for errors it can't tie to a test var (a fixture-init throw or a
// namespace load/compile error). That var-less file carries a `<testcase>` with
// a `name` but no `classname`, so it parses to a namespace-less failure — which
// is exactly what makes the granular-rerun collector fall back to a full rerun
// instead of a misleadingly narrow one. Miss the file and those errors vanish
// from JUnit again, reopening that gap.
const VAR_LESS_ERRORS_FILE = "mb_hawk_var_less_errors.xml";
const selectHawkJunit = (entries: string[]): string[] =>
  entries.filter(
    (entry) => entry.endsWith("_test.xml") || entry.endsWith(VAR_LESS_ERRORS_FILE),
  );

/**
 * Normalize every JUnit file hawk wrote under `dir` into `NormalizedTest[]` —
 * the source-specific half of the adapter pattern (hawk XML → the shared
 * normalized shape).
 */
export function normalizeBackendJunit(
  dir: string = JUNIT_DIR,
): NormalizedTest[] {
  const files = findJunitFiles(dir, selectHawkJunit);
  const failures = files.flatMap((file) => {
    try {
      return parseJunit(readFileSync(file, "utf8"));
    } catch (error) {
      console.error(`[ci-conductor] failed to read ${file}`, error);
      return [];
    }
  });
  log(
    `scanned ${dir}: ${files.length} JUnit file(s), ${failures.length} failing test(s)`,
  );
  for (const test of failures) {
    log(`  failing: ${test.path || "(no namespace)"} / ${test.name}`);
  }
  return failures;
}
