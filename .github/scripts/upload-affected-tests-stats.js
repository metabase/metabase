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
  "Modules Changed": stats.modules_changed,
  "Modules affected": stats.modules_affected,
  "FE Unit tests total": stats.unit_tests_total,
  "FE Unit tests run": stats.unit_tests_to_run,
  "FE Unit tests skipped": stats.unit_tests_to_skip,
  "Loki stories total": stats.loki_stories_total,
  "Loki stories run": stats.loki_stories_to_run,
  "Loki stories skipped": stats.loki_stories_to_skip,
  "E2E tests total": stats.e2e_tests_total,
  "E2E tests run": stats.e2e_tests_to_run,
  "E2E tests skipped": stats.e2e_tests_to_skip,
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
