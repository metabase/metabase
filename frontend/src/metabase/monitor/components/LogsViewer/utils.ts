import dayjs from "dayjs";
import _ from "underscore";

import type { Log } from "metabase-types/api";

export function getAllProcessUUIDs(logs: Log[]) {
  const uuids = new Set<string>();
  logs.forEach((log) => uuids.add(log.process_uuid));
  return [...uuids].filter(Boolean).sort();
}

// date formatting is expensive for megabytes of logs
const formatTs = (ts: string) => dayjs(ts).format();
const memoedFormatTs = _.memoize(formatTs);

export const createLogFormatter =
  (process: string, processUUIDs: string[]) =>
  (log: Log): string[] => {
    const timestamp = memoedFormatTs(log.timestamp);
    const uuid =
      process === "ALL" && processUUIDs.length > 1
        ? `[${log.process_uuid}]`
        : undefined;
    return [
      [uuid, timestamp, log.level, log.fqns, log.msg].filter(Boolean).join(" "),
      ...(log.exception ?? []),
    ];
  };
