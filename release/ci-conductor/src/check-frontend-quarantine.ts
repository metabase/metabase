#!/usr/bin/env bun

// Frontend quarantine gate entrypoint. Runs as a post-test CI step on the
// frontend (jest) path: parse the JUnit jest-junit just wrote, then check the
// failures against ci-conductor's quarantine list via the shared gate. Dry-run
// by default — observational, never fails the job. Best-effort: gating must never
// break a run.
//
// Reads the SAME JUnit and resolves the SAME suite label as `report-frontend.ts`
// (the stable `fe-tests-unit`, shard-independent), so the gate checks against
// exactly the list those reports populate.
//
// Run directly with bun (no build step):  bun src/check-frontend-quarantine.ts

import { normalizeFrontendJunit } from "./adapters/frontend.ts";
import {
  applyQuarantineGate,
  junitFailuresToFailedTests,
} from "./quarantine.ts";
import { log } from "./util.ts";

async function main(): Promise<void> {
  log("frontend quarantine gate starting");
  const env = process.env;
  const suite = env.CI_CONDUCTOR_TEST_SUITE || "frontend";
  await applyQuarantineGate({
    suite,
    failures: junitFailuresToFailedTests(normalizeFrontendJunit()),
    baseUrl: env.CI_CONDUCTOR_BASE_URL,
    secret: env.CI_CONDUCTOR_WEBHOOK_SECRET,
    dryRun: env.QUARANTINE_DRY_RUN !== "false",
  });
}

main().catch((error) => {
  // Last line of defense: the gate must never throw into the job.
  console.error("[ci-conductor] frontend quarantine gate failed (ignored)", error);
});
