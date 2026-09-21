import type { Log } from "metabase-types/api";

import { mergeLogs } from "./utils";

function createLog(log: Partial<Log> = {}): Log {
  return {
    timestamp: "2024-01-10T21:21:58.597Z",
    level: "DEBUG",
    fqns: "metabase.server.middleware.log",
    msg: "GET /api/collection/root 200",
    exception: null,
    process_uuid: "e7774ef2-42ab-43de-89f7-d6de9fdc624f",
    ...log,
  };
}

describe("mergeLogs", () => {
  it("merges logs from several arrays, oldest first", () => {
    const first = createLog({ timestamp: "2024-01-10T21:21:58.001Z" });
    const second = createLog({ timestamp: "2024-01-10T21:21:58.002Z" });
    const third = createLog({ timestamp: "2024-01-10T21:21:58.003Z" });

    expect(mergeLogs([[third], [first, second]])).toEqual([
      first,
      second,
      third,
    ]);
  });

  it("drops duplicates when polled batches overlap", () => {
    const older = createLog({ timestamp: "2024-01-10T21:21:58.001Z" });
    const newer = createLog({ timestamp: "2024-01-10T21:21:58.002Z" });
    const newest = createLog({ timestamp: "2024-01-10T21:21:58.003Z" });

    expect(
      mergeLogs([
        [older, newer],
        [newer, newest],
      ]),
    ).toEqual([older, newer, newest]);
  });

  it("keeps logs that are not exact duplicates", () => {
    const timestamp = "2024-01-10T21:21:58.597Z";
    const log = createLog({ timestamp });
    const sameTimeOtherMessage = createLog({ timestamp, msg: "other message" });
    const sameTimeOtherNamespace = createLog({
      timestamp,
      fqns: "metabase.db",
    });

    expect(
      mergeLogs([[log], [sameTimeOtherMessage], [sameTimeOtherNamespace]]),
    ).toHaveLength(3);
  });
});
