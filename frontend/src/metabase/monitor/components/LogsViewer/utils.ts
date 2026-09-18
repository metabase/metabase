import { dayjs } from "metabase/dayjs";
import type { Log } from "metabase-types/api";

export function getAllProcessUUIDs(logs: Log[]) {
  const uuids = new Set<string>();
  logs.forEach((log) => uuids.add(log.process_uuid));
  return [...uuids].filter(Boolean).sort();
}

/**
 * Date formatting is expensive for megabytes of logs, and the polling viewer
 * reformats the whole accumulated list on every render and every filter
 * keystroke. Keying on the log object rather than on its timestamp lets an
 * entry die with the log instead of living as long as the tab.
 */
const formattedTimestamps = new WeakMap<Log, string>();

function formatTimestamp(log: Log): string {
  const cached = formattedTimestamps.get(log);
  if (cached !== undefined) {
    return cached;
  }

  const formatted = dayjs(log.timestamp).format();
  formattedTimestamps.set(log, formatted);
  return formatted;
}

export const createLogFormatter =
  (process: string, processUUIDs: string[]) =>
  (log: Log): string[] => {
    const timestamp = formatTimestamp(log);
    const uuid =
      process === "ALL" && processUUIDs.length > 1
        ? `[${log.process_uuid}]`
        : undefined;
    return [
      [uuid, timestamp, log.level, log.fqns, log.msg].filter(Boolean).join(" "),
      ...(log.exception ?? []),
    ];
  };
