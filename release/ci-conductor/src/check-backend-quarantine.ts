#!/usr/bin/env bun

// Backend quarantine gate entrypoint. Runs as a post-test CI step on the backend
// and driver paths: parse the JUnit hawk just wrote, then check the failures
// against ci-conductor's quarantine list via the shared gate. Dry-run by default
// — observational, never fails the job. Best-effort: gating must never break a run.
//
// Reads the SAME JUnit and resolves the SAME suite label as `report-backend.ts`,
// so the gate checks against exactly the list those reports populate.
//
// Run directly with bun (no build step):  bun src/check-backend-quarantine.ts

import { normalizeBackendJunit } from "./adapters/backend.ts";
import {
  junitFailuresToFailedTests,
  runQuarantineGate,
} from "./quarantine.ts";
import { log } from "./util.ts";

async function main(): Promise<void> {
  log("backend quarantine gate starting");
  const env = process.env;
  const suite =
    env.CI_CONDUCTOR_TEST_SUITE ||
    (env.DRIVERS ? `driver-${env.DRIVERS}` : "backend");
  const result = await runQuarantineGate({
    suite,
    failures: junitFailuresToFailedTests(normalizeBackendJunit()),
    baseUrl: env.CI_CONDUCTOR_BASE_URL,
    secret: env.CI_CONDUCTOR_WEBHOOK_SECRET,
    dryRun: env.QUARANTINE_DRY_RUN !== "false",
  });
  if (result.enforced) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  // Last line of defense: the gate must never throw into the job.
  console.error("[ci-conductor] backend quarantine gate failed (ignored)", error);
});
