// Appends the measured bundle sizes (with deltas) to the "Bundle Sizes" table
// in eng-stats-importer. Reads ROWS (a JSON file of rows) and API_KEY from env,
// and reports whether the import landed via the `uploaded` step output.

import { appendFileSync, readFileSync } from "node:fs";

import { importStats, type StatsRow } from "./stats-import";

/** `core.setOutput` without the github-script runtime. */
function setOutput(name: string, value: string) {
  const file = process.env.GITHUB_OUTPUT;
  if (file) {
    appendFileSync(file, `${name}=${value}\n`);
  }
}

async function main() {
  const rowsPath = process.env.ROWS || "artifacts/upload-rows.json";
  const rows = JSON.parse(readFileSync(rowsPath, "utf8")) as StatsRow[];

  console.table(rows);

  try {
    await importStats({ table: "bundle_sizes", rows });
    console.log("Bundle sizes uploaded successfully");
    setOutput("uploaded", "true");
  } catch (error) {
    // Stats logging is best-effort: if the importer is still unreachable after
    // the client's retries, keep the run green. The last-plotted cache is only
    // saved on a successful upload, so this point is re-attempted on the next
    // master build and nothing is silently dropped.
    const message = error instanceof Error ? error.message : String(error);
    console.log(`::warning::Bundle-size upload failed after retries; leaving run green: ${message}`);
    setOutput("uploaded", "false");
  }
}

main();
