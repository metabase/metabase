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
  // `test_suite` is the per-job identity discriminator. Frontend unit tests are
  // sharded, so each shard exports its unique label as `CI_CONDUCTOR_TEST_SUITE`
  // (e.g. `fe-unit-shard-1`) to keep the same test run on different shards
  // distinct in ci-conductor's identity key. Falls back to a generic `frontend`.
  const testSuite = env.CI_CONDUCTOR_TEST_SUITE || "frontend";
  await reportTestFailures(normalizeFrontendJunit(), testSuite);
}

main().catch((error) => {
  // Last line of defense: reporting must never fail the job.
  console.error("[ci-conductor] frontend reporting failed (ignored)", error);
});
