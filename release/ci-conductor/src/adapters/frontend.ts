// Frontend (jest) adapter: jest-junit's JUnit XML → NormalizedTest[].
//
// jest-junit writes a single JUnit file per job, its location given by jest's
// own `JEST_JUNIT_OUTPUT_DIR` / `JEST_JUNIT_OUTPUT_NAME` env contract (the
// `frontend.yml` job sets both). So the frontend "collector" is a post-run read
// of that one file. The XML parsing itself is shared (`../junit.ts`); this owns
// the frontend-specific parts — where jest-junit drops its file — while the
// suite label is supplied by the entrypoint.
//
// Two jest-junit details that mean there's nothing to massage here:
//   - it already strips ANSI colour codes from failure bodies, so messages
//     arrive plain (unlike a raw jest console dump);
//   - it entity-escapes (rather than CDATA-wraps) those bodies, which
//     `parseJunit`'s `elementBody` already decodes.
//
// FILE / IDENTITY NOTE: `jest.config.js` sets jest-junit's `addFileAttribute`,
// so each <testcase> carries the source path as a `file` attribute, which the
// shared parser surfaces as `file_path`. We deliberately leave jest-junit's
// `classname`/`name` on their defaults (the same `{ancestors} {title}` blob in
// both) rather than re-template them: that artifact is also what Trunk ingests,
// and changing those fields would re-baseline its test identity. So `test_path`
// and `test_name` carry that blob (redundant but a stable, unique key) and
// identity is (test_suite, test_path, test_name, file_path).

import { readFileSync } from "node:fs";

import type { NormalizedTest } from "../contract.ts";
import { findJunitFiles, parseJunit } from "../junit.ts";
import { log } from "../util.ts";

const JUNIT_DIR = process.env.JEST_JUNIT_OUTPUT_DIR || "target/junit";
const JUNIT_NAME = process.env.JEST_JUNIT_OUTPUT_NAME || "junit.xml";

/**
 * Pick jest-junit's output from a directory listing by the exact name its env
 * contract sets (`JEST_JUNIT_OUTPUT_NAME`). An empty match means nothing to
 * report.
 */
function selectJestJunit(name: string): (entries: string[]) => string[] {
  return (entries) => entries.filter((entry) => entry.endsWith(name));
}

/**
 * Normalize the JUnit file(s) jest-junit wrote under `dir` into
 * `NormalizedTest[]` — the source-specific half of the adapter pattern
 * (jest-junit XML → the shared normalized shape).
 */
export function normalizeFrontendJunit(
  dir: string = JUNIT_DIR,
  name: string = JUNIT_NAME,
): NormalizedTest[] {
  const files = findJunitFiles(dir, selectJestJunit(name));
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
    log(`  failing: ${test.path || "(no describe path)"} / ${test.name}`);
  }
  return failures;
}
