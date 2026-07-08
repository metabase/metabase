#!/usr/bin/env bun

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
  console.error(
    "[ci-conductor] frontend quarantine gate failed (ignored)",
    error,
  );
});
