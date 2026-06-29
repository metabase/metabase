// Backend (Clojure/hawk) adapter: hawk's JUnit XML → NormalizedTest[].
//
// hawk always writes JUnit XML to `target/junit/`, so the backend "collector"
// is a post-run scan of that artifact (one runner, one artifact, covering both
// the backend and driver CI paths). The XML parsing itself is shared
// (`../junit.ts`); this owns the backend-specific parts — hawk's `*_test.xml`
// file layout — while the suite label is supplied by the entrypoint.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { NormalizedTest } from "../contract.ts";
import { parseJunit } from "../junit.ts";
import { log } from "../util.ts";

const JUNIT_DIR = process.env.JUNIT_DIR || "target/junit";

/** Recursively list `*_test.xml` files under `dir`. Returns [] on any error. */
function findJunitFiles(dir: string): string[] {
  try {
    return readdirSync(dir, { recursive: true })
      .map((entry) => String(entry))
      .filter((entry) => entry.endsWith("_test.xml"))
      .map((entry) => join(dir, entry));
  } catch {
    return [];
  }
}

/**
 * Normalize every JUnit file hawk wrote under `dir` into `NormalizedTest[]` —
 * the source-specific half of the adapter pattern (hawk XML → the shared
 * normalized shape).
 */
export function normalizeBackendJunit(
  dir: string = JUNIT_DIR,
): NormalizedTest[] {
  const files = findJunitFiles(dir);
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
