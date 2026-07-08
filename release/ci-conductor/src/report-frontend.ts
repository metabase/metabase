#!/usr/bin/env bun

// Frontend test-failure reporter entrypoint. Runs as a post-test CI step on the
// frontend (jest) path: normalize the JUnit jest-junit just wrote and report the
// failures to ci-conductor. Best-effort — reporting must never break a test run.
//
// Run directly with bun (no build step):  bun src/report-frontend.ts

import { normalizeFrontendJunit } from "./adapters/frontend.ts";
import { reportTestFailures } from "./transport.ts";
import { log } from "./util.ts";

async function main(): Promise<void> {
  log("frontend test-failure reporter starting");
  const env = process.env;
  // `test_suite` is the suite-level identity discriminator. Frontend unit tests
  // are jest-sharded across parallel jobs, but each test file runs on exactly
  // one shard, so every shard reports a disjoint subset under the SAME stable
  // suite (`fe-tests-unit`, the job name, set via `CI_CONDUCTOR_TEST_SUITE`) —
  // the shard number is deliberately NOT part of the suite, or a test would re-key in
  // ci-conductor whenever sharding changes. Falls back to a generic `frontend`.
  const testSuite = env.CI_CONDUCTOR_TEST_SUITE || "frontend";
  await reportTestFailures(normalizeFrontendJunit(), testSuite);
}

main().catch((error) => {
  // Last line of defense: reporting must never fail the job.
  console.error("[ci-conductor] frontend reporting failed (ignored)", error);
});
