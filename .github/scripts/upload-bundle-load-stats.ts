// Appends the measured load times to the "Bundle Load Times" table in
// eng-stats-importer. Reads ROWS (the JSON matrix.js prints) and API_KEY from
// env, and stamps each row with the commit it came from.

import { readFileSync } from "node:fs";

import { type Condition, buildRows } from "./bundle-load-stats-rows";
import { importStats } from "./stats-import";

async function main() {
  const path = process.env.ROWS || "artifacts/load-times.json";
  // matrix.js wrote this file, and Condition is the shape it prints.
  const conditions = JSON.parse(readFileSync(path, "utf8")) as Condition[];

  const rows = buildRows(conditions, {
    sha: process.env.HEAD_SHA || "",
    date: process.env.COMMIT_DATE,
    subject: process.env.COMMIT_MESSAGE || "",
  });

  console.table(rows);

  try {
    await importStats({ table: "bundle_load_times", rows });
    console.log("Load times uploaded successfully");
  } catch (error) {
    // Stats logging is best-effort. A point lost to an unreachable importer is
    // worth less than a red build on master, and the next commit plots another.
    const message = error instanceof Error ? error.message : String(error);
    console.log(
      `::warning::Load-time upload failed after retries; leaving run green: ${message}`,
    );
  }
}

main();
