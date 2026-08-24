// Appends the test-plan stats row produced by create-test-plan.ts to the
// "FE Affected Tests" table in eng-stats-importer.
// Reads STATS_JSON, PR_NUMBER, HEAD_SHA, BASE_SHA, API_KEY from env.

import type { TestPlanStats } from "./affected-tests";
import { importStats } from "./stats-import";

const TABLE = "fe_affected_tests";

async function main() {
  // create-test-plan doesn't always produce stats (e.g. on release branches
  // running an older planner), leaving STATS_JSON empty. Nothing to upload.
  const raw = (process.env.STATS_JSON || "").trim();
  if (!raw || raw === "null") {
    console.log("No STATS_JSON to upload; skipping.");
    return;
  }

  const s = JSON.parse(raw) as TestPlanStats;
  console.log("stats", s);

  const row = {
    Date: new Date().toISOString(),
    // ("Trigger" is a reserved SQL word.)
    "Triggered By": "pr_update",
    PR: Number(process.env.PR_NUMBER),
    "Head SHA": process.env.HEAD_SHA,
    "Base SHA": process.env.BASE_SHA,
    "FE Files Changed": s.fe_files_changed,
    "FE Files Total": s.fe_files_total,
    "BE Files Changed": s.be_files_changed,
    "BE Files Total": s.be_files_total,
    "Unit Infra Touched": s.unit_infra_touched,
    "Loki Infra Touched": s.loki_infra_touched,
    "Shared Sources Touched": s.shared_sources_touched,
    "FE Modules Total": s.fe_modules_total,
    "FE Modules Changed": s.fe_modules_changed,
    "FE Modules Affected (Rules)": s.fe_modules_affected_rules,
    "FE Modules Affected (Usage)": s.fe_modules_affected_usage,
    "Unit Specs All": s.unit_specs_all,
    "Unit Specs To Run (Rules)": s.unit_specs_to_run_rules,
    "Unit Specs To Run (Usage)": s.unit_specs_to_run_usage,
    "Loki Stories All": s.loki_stories_all,
    "Loki Stories To Run (Rules)": s.loki_stories_to_run_rules,
    "Loki Stories To Run (Usage)": s.loki_stories_to_run_usage,
    // Spelled as the column name rather than a display name: the importer
    // splits a digit-then-capital run, so "E2E Specs All" would normalize to
    // `e2_e_specs_all` instead of `e2e_specs_all`.
    e2e_specs_all: s.e2e_specs_all,
    e2e_specs_to_run_rules: s.e2e_specs_to_run_rules,
    e2e_specs_to_run_usage: s.e2e_specs_to_run_usage,
  };

  await importStats({ table: TABLE, rows: [row] });
  console.log("Data uploaded successfully");
}

// Best-effort: never let a telemetry failure turn the job red.
main().catch((error) => {
  console.error("Skipping stats upload after error:", error);
  process.exit(0);
});
