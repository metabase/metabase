#!/usr/bin/env bun

import { normalizeBackendJunit } from "./adapters/backend.ts";
import {
  applyQuarantineGate,
  junitFailuresToFailedTests,
} from "./quarantine.ts";
import { log } from "./util.ts";

async function main(): Promise<void> {
  log("backend quarantine gate starting");
  const env = process.env;
  const suite =
    env.CI_CONDUCTOR_TEST_SUITE ||
    (env.DRIVERS ? `driver-${env.DRIVERS}` : "backend");
  await applyQuarantineGate({
    suite,
    failures: junitFailuresToFailedTests(normalizeBackendJunit()),
    baseUrl: env.CI_CONDUCTOR_BASE_URL,
    secret: env.CI_CONDUCTOR_WEBHOOK_SECRET,
    dryRun: env.QUARANTINE_DRY_RUN !== "false",
  });
}

main().catch((error) => {
  // Last line of defense: the gate must never throw into the job.
  console.error(
    "[ci-conductor] backend quarantine gate failed (ignored)",
    error,
  );
});
