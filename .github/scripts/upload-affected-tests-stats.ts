// Appends the test-plan stats row produced by create-test-plan.ts to the
// "FE Affected Tests" table in eng-stats-importer.
// Reads STATS_JSON, PR_NUMBER, HEAD_SHA, BASE_SHA, API_KEY from env.

import type { TestPlanStats } from "./affected-tests";
import { importStats } from "./stats-import";

const TABLE = "fe_affected_tests";

async function main() {
  // create-test-plan doesn't always produce stats, leaving STATS_JSON empty. Nothing to upload.
  const raw = (process.env.STATS_JSON || "").trim();
  if (!raw || raw === "null") {
    console.log("No STATS_JSON to upload; skipping.");
    return;
  }

  const s = JSON.parse(raw) as TestPlanStats;
  console.log("stats", s);

  // The planner's single module-graph selection is what the table's "(Rules)" columns record.
  // The importer leaves omitted columns unpopulated, so the row carries only what the planner computes.
  const row = {
    Date: new Date().toISOString(),
    // ("Trigger" is a reserved SQL word.)
    "Triggered By": "pr_update",
    PR: Number(process.env.PR_NUMBER),
    "Head SHA": process.env.HEAD_SHA,
    "Base SHA": process.env.BASE_SHA,
    "FE Modules Changed": s.modules_changed,
    "FE Modules Affected (Rules)": s.modules_affected,
    "Unit Specs All": s.fe_unit_specs_total,
    "Unit Specs To Run (Rules)": s.fe_unit_specs_run,
    "Loki Stories All": s.loki_stories_total,
    "Loki Stories To Run (Rules)": s.loki_stories_run,
    // Spelled as the column name rather than a display name: the importer
    // splits a digit-then-capital run, so "E2E Specs All" would normalize to
    // `e2_e_specs_all` instead of `e2e_specs_all`.
    e2e_specs_all: s.e2e_specs_total,
    e2e_specs_to_run_rules: s.e2e_specs_run,
  };

  await importStats({ table: TABLE, rows: [row] });
  console.log("Data uploaded successfully");
}

// Best-effort: never let a telemetry failure turn the job red.
main().catch((error) => {
  console.error("Skipping stats upload after error:", error);
  process.exit(0);
});
