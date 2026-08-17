#!/usr/bin/env bun

// Backend test-failure reporter entrypoint. Runs as a post-test CI step on the
// backend and driver paths: normalize the raw JUnit hawk just wrote and report
// the failures to ci-conductor. Best-effort — reporting must never break a test
// run.
//
// Run directly with bun (no build step):  bun src/report-backend.ts

import { normalizeBackendJunit } from "./adapters/backend.ts";
import { reportTestFailures } from "./transport.ts";
import { log } from "./util.ts";

async function main(): Promise<void> {
  log("backend test-failure reporter starting");
  const env = process.env;
  // `test_suite` is the per-job identity discriminator: each driver / backend
  // job exports its unique label as `CI_CONDUCTOR_TEST_SUITE` (e.g.
  // `be-tests-java-21-ee`, `driver-postgres-ee`) so the same namespace run on
  // different drivers or legs stays distinct in ci-conductor's identity key.
  // Falls back to the driver keyword, then a generic `backend`.
  const testSuite =
    env.CI_CONDUCTOR_TEST_SUITE ||
    (env.DRIVERS ? `driver-${env.DRIVERS}` : "backend");
  await reportTestFailures(normalizeBackendJunit(), testSuite);
}

main().catch((error) => {
  // Last line of defense: reporting must never fail the job.
  console.error("[ci-conductor] backend reporting failed (ignored)", error);
});
