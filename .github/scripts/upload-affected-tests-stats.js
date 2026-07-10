// Appends the test-plan stats row produced by create-test-plan.ts to the
// "FE Affected Tests" table on stats.metabase.com.
// Reads STATS_JSON, TRIGGERED_BY, PR_NUMBER, HEAD_SHA, BASE_SHA, API_KEY from env.

const { uploadCsvToMb } = require("./csv-to-mb.js");

// "FE Affected Tests" uploaded table on stats.metabase.com.
const TABLE_ID = 81818;

async function main() {
  // create-test-plan doesn't always produce stats (e.g. on release branches
  // running an older planner), leaving STATS_JSON empty. Nothing to upload.
  const raw = (process.env.STATS_JSON || "").trim();
  if (!raw || raw === "null") {
    console.log("No STATS_JSON to upload; skipping.");
    return;
  }

  const s = JSON.parse(raw);
  console.log("stats", s);

  const row = {
    Date: new Date().toISOString(),
    // "pr_update" or "merge_to_master". ("Trigger" is a reserved SQL word.)
    "Triggered By": process.env.TRIGGERED_BY,
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
    "E2E Specs All": s.e2e_specs_all,
    "E2E Specs To Run (Rules)": s.e2e_specs_to_run_rules,
    "E2E Specs To Run (Usage)": s.e2e_specs_to_run_usage,
  };

  await uploadCsvToMb({
    baseUrl: "https://stats.metabase.com",
    tableId: TABLE_ID,
    jsonData: [row],
    mode: "append",
  });
  console.log("Data uploaded successfully");
}

// Best-effort: never let a telemetry failure turn the job red.
main().catch((error) => {
  console.error("Skipping stats upload after error:", error);
  process.exit(0);
});
