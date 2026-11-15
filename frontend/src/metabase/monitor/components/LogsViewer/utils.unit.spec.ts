import { createLogFormatter } from "metabase/monitor/components/LogsViewer/utils";
import type { Log } from "metabase-types/api";

const PROCESS_UUID = "3f2a1c00-0000-4000-8000-000000000000";

function makeLog(timestampMs: number): Log {
  return {
    timestamp: new Date(timestampMs).toISOString(),
    process_uuid: PROCESS_UUID,
    fqns: "metabase.server.middleware.log",
    msg: "GET /api/dashboard/1 200",
    level: "INFO",
    exception: null,
  };
}

describe("createLogFormatter", () => {
  it("reuses the formatted timestamp for the same log object", () => {
    const log = makeLog(Date.UTC(2024, 0, 1));
    const formatLog = createLogFormatter("ALL", [PROCESS_UUID]);
    const firstLine = formatLog(log)[0];

    // The app never mutates a log. This is the only way to observe that the
    // second call read the cache instead of reformatting.
    log.timestamp = new Date(Date.UTC(2024, 6, 1)).toISOString();

    expect(formatLog(log)[0]).toBe(firstLine);
  });

  it("formats a separate log object independently", () => {
    const formatLog = createLogFormatter("ALL", [PROCESS_UUID]);

    expect(formatLog(makeLog(Date.UTC(2024, 0, 1)))[0]).not.toBe(
      formatLog(makeLog(Date.UTC(2024, 6, 1)))[0],
    );
  });
});
