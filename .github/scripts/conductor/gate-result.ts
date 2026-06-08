#!/usr/bin/env bun
//
// gate-result.ts — the per-driver required status check.
//
// Each driver-*.yml workflow ends with a `result` job that runs this (via the
// driver-gate composite action). It decides the workflow's overall pass/fail
// from the decide + test job results and the conductor status, implementing the
// skip/info/required contract:
//
//   - decide must have succeeded (the gate itself must be healthy)
//   - conductor status "info"  => always pass (just log what really happened)
//   - otherwise                 => pass iff every test job succeeded or skipped
//
// Inputs (via env):
//   DECIDE_RESULT     result of the decide job   (success|failure|cancelled|skipped)
//   TEST_RESULTS      space-separated results of this workflow's test job(s)
//                     (e.g. "success", or "success skipped" for multi-job files)
//   CONDUCTOR_STATUS  skip|info|required          (may be empty if decide failed)
//
// Run with: bun .github/scripts/conductor/gate-result.ts

const {
  DECIDE_RESULT = "",
  TEST_RESULTS = "",
  CONDUCTOR_STATUS = "",
} = process.env;

console.log(
  `decide=${DECIDE_RESULT} test=[${TEST_RESULTS}] conductor=${CONDUCTOR_STATUS || "<none>"}`,
);

function fail(message: string): never {
  console.log(`::error::${message}`);
  process.exit(1);
}

// The decision gate must be healthy. If mage/conductor lookups failed, fail
// closed rather than silently passing untested code.
if (DECIDE_RESULT !== "success") {
  fail(`Driver decision job did not succeed (${DECIDE_RESULT}); failing closed.`);
}

// "info": run for data only — never block, regardless of outcome.
if (CONDUCTOR_STATUS === "info") {
  console.log(
    `Conductor status is 'info' — auto-passing (test results were: [${TEST_RESULTS}]).`,
  );
  process.exit(0);
}

// skip / required: a skipped test job (driver not selected, or conductor skip)
// passes; a successful one passes; anything else fails. Every test job in the
// workflow must clear this bar.
const results = TEST_RESULTS.split(/\s+/).filter(Boolean);
for (const result of results) {
  if (result !== "success" && result !== "skipped") {
    fail(`Driver tests did not pass (a test job result was: ${result}).`);
  }
}

console.log("Driver tests passed (or were skipped).");
process.exit(0);
