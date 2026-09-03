import {
  formatRetentionProfile,
  profileCacheRetention,
  requireGarbageCollection,
} from "__support__/memory";
import { createLogFormatter } from "metabase/monitor/components/LogsViewer/utils";
import type { Log } from "metabase-types/api";

const PROCESS_UUID = "3f2a1c00-0000-4000-8000-000000000000";

const BATCH = 40_000;
const FIRST_BATCH_START_MS = Date.UTC(2024, 0, 1);
const SECOND_BATCH_START_MS = Date.UTC(2024, 6, 1);
const THIRD_BATCH_START_MS = Date.UTC(2025, 0, 1);

// Pass 3 measured +4.9 MB when the cache was keyed on the timestamp string at
// module level. See profileCacheRetention for why pass 1 is not asserted.
const RETENTION_BUDGET_MB = 1;

/**
 * Log lines as the polling viewer sees them: one per millisecond, so timestamps
 * are effectively unique. See usePollingLogsQuery in the Logs page hooks.
 */
function makeLogs(firstMs: number, count: number): Log[] {
  return Array.from({ length: count }, (_, index) => ({
    timestamp: new Date(firstMs + index).toISOString(),
    process_uuid: PROCESS_UUID,
    fqns: "metabase.server.middleware.log",
    msg: `GET /api/dashboard/${index} 200 [ASYNC: completed]`,
    level: "INFO",
    exception: null,
  }));
}

function formatAll(logs: Log[]) {
  const formatLog = createLogFormatter("ALL", [PROCESS_UUID]);
  logs.forEach((log) => formatLog(log));
}

describe("LogsViewer formatted timestamp cache", () => {
  it("reuses the formatted timestamp for the same log object", () => {
    const [log] = makeLogs(FIRST_BATCH_START_MS, 1);
    const formatLog = createLogFormatter("ALL", [PROCESS_UUID]);
    const firstLine = formatLog(log)[0];

    // The app never mutates a log. This is the only way to observe that the
    // second call read the cache instead of reformatting.
    log.timestamp = new Date(SECOND_BATCH_START_MS).toISOString();

    expect(formatLog(log)[0]).toBe(firstLine);
  });

  it("formats a separate log object independently", () => {
    const formatLog = createLogFormatter("ALL", [PROCESS_UUID]);
    const [first] = makeLogs(FIRST_BATCH_START_MS, 1);
    const [second] = makeLogs(SECOND_BATCH_START_MS, 1);

    expect(formatLog(first)[0]).not.toBe(formatLog(second)[0]);
  });

  it("retains nothing once the logs are dropped", () => {
    requireGarbageCollection();

    const profile = profileCacheRetention({
      driveNewKeys: () => formatAll(makeLogs(FIRST_BATCH_START_MS, BATCH)),
      driveSameKeys: () => formatAll(makeLogs(SECOND_BATCH_START_MS, BATCH)),
      driveMoreNewKeys: () => formatAll(makeLogs(THIRD_BATCH_START_MS, BATCH)),
    });

    // eslint-disable-next-line no-console
    console.log(
      formatRetentionProfile(profile, {
        entryCount: BATCH,
        entryLabel: "distinct log timestamps, logs fully dropped",
      }),
    );

    expect(profile.moreNewKeysMb).toBeLessThan(RETENTION_BUDGET_MB);
  });
});
