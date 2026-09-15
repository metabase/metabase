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

const TABLE = 'e2e_test_timings';

const buildTestTimingsRow = (
    timestamp: string,
    path = "e2e/support/timings.json",
): StatsRow => {
    const timings = JSON.parse(readFileSync(path, 'utf-8'));

    const specCount = timings.durations?.length ?? 0;

    if (specCount === 0) {
        throw new Error(`No durations found in ${path}.`)
    }

    let totalRunTime = 0;
    let maxSpecRuntime = 0;
    for (let i = 0;  i < specCount; i++) {
        let duration = timings.durations[i].duration;
        if (typeof duration !== "number") continue;

        totalRunTime += duration;
        maxSpecRuntime = duration > maxSpecRuntime ? duration : maxSpecRuntime;
    }

    const averageSpecRuntime = Math.round(totalRunTime / specCount);

    return {
        'date': timestamp,
        'spec_count': specCount,
        'total_runtime': totalRunTime,
        'avg_spec_runtime': averageSpecRuntime,
        'max_spec_runtime': maxSpecRuntime,
    }
}

async function main() {
    const path = process.env.TIMINGS_PATH || "e2e/support/timings.json";

    try {
        const row = buildTestTimingsRow(new Date().toISOString(), path);
        console.log(row);

        await importStats({table: TABLE, rows: [row]});
        console.log(`Sucessfully uploaded e2e test timings to ${TABLE}.`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(
        `::warning::Uploading e2e test timings failed; leaving run green: ${message}`,
        );
    }
}

main();
