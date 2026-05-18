// This script is used in .github/workflows/run-tests.yml.
// It uploads the test-plan stats row produced by create-test-plan.js to
// the stats.metabase.com tracking table.
// Reads STATS_JSON, PR_NUMBER, HEAD_SHA, BASE_SHA, API_KEY from env.

const { uploadCsvToMb } = require("./csv-to-mb.js");

const stats = JSON.parse(process.env.STATS_JSON);
console.log("stats", stats);

const row = {
  Date: new Date().toISOString(),
  PR: Number(process.env.PR_NUMBER),
  "Head SHA": process.env.HEAD_SHA,
  "Base SHA": process.env.BASE_SHA,
  "Modules changed": stats.modules_changed,
  "Modules affected": stats.modules_affected,
  "FE Unit specs total": stats.fe_unit_specs_total,
  "FE Unit specs run": stats.fe_unit_specs_run,
  "FE Unit specs skipped": stats.fe_unit_specs_skipped,
  "Loki stories total": stats.loki_stories_total,
  "Loki stories run": stats.loki_stories_run,
  "Loki stories skipped": stats.loki_stories_skipped,
  "E2E specs total": stats.e2e_specs_total,
  "E2E specs run": stats.e2e_specs_run,
  "E2E specs skipped": stats.e2e_specs_skipped,
};

uploadCsvToMb({
  baseUrl: "https://stats.metabase.com",
  tableId: 76835,
  jsonData: [row],
  mode: "append",
})
  .then(() => {
    console.log("Data uploaded successfully");
  })
  .catch((error) => {
    console.error("Error uploading data:", error);
    process.exit(1);
  });
