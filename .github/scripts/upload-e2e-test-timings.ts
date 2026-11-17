/**
 * Collect some stats about our e2e tests:
 *   - total number of spec files
 *   - total time to run all specs
 *   - average spec runtime
 *   - max spec runtime
 *
 */

import { readFileSync } from "node:fs";

import { importStats, StatsRow } from "./stats-import";

const TABLE = "e2e_test_timings";

export interface Timings {
  durations?: { spec?: string; duration?: unknown }[];
}

export const buildTestTimingsRow = (
  timestamp: string,
  timings: Timings,
): StatsRow => {
  const durations = timings.durations ?? [];
  const specCount = durations.length;

  if (specCount === 0) {
    throw new Error("No durations found.");
  }

  let totalRunTime = 0;
  let maxSpecRuntime = 0;
  for (const { duration } of durations) {
    if (typeof duration !== "number") {
      continue;
    }

    totalRunTime += duration;
    maxSpecRuntime = duration > maxSpecRuntime ? duration : maxSpecRuntime;
  }

  const averageSpecRuntime = Math.round(totalRunTime / specCount);

  return {
    date: timestamp,
    spec_count: specCount,
    total_runtime: totalRunTime,
    avg_spec_runtime: averageSpecRuntime,
    max_spec_runtime: maxSpecRuntime,
  };
};

export async function main() {
  const path = process.env.TIMINGS_PATH || "e2e/support/timings.json";

  try {
    const timings = JSON.parse(readFileSync(path, "utf-8")) as Timings;
    const row = buildTestTimingsRow(new Date().toISOString(), timings);
    console.log(row);

    await importStats({ table: TABLE, rows: [row] });
    console.log(`Successfully uploaded e2e test timings to ${TABLE}.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(
      `::warning::Uploading e2e test timings from ${path} failed; leaving run green: ${message}`,
    );
  }
}

if ((import.meta as ImportMeta & { main?: boolean }).main) {
  main();
}
