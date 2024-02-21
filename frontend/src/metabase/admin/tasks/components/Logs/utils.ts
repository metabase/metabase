import dayjs from "dayjs";
import _ from "underscore";

import type { Log } from "metabase-types/api";

const MAX_LOGS = 50000;

function logEventKey(ev: Log) {
  return `${ev.timestamp}, ${ev.process_uuid}, ${ev.fqns}, ${ev.msg}`;
}

export function mergeLogs(logArrays: Log[][]) {
  let prevLogKey = "";
  return logArrays
    .flat()
    .sort((logA, logB) => {
      return (
        logA.timestamp - logB.timestamp ||
        logA.process_uuid.localeCompare(logB.process_uuid) ||
        logA.msg.localeCompare(logB.msg)
      );
    })
    .filter(log => {
      const key = logEventKey(log);
      const keep = key !== prevLogKey;
      if (keep) {
        prevLogKey = key;
      }
      return keep;
    })
    .slice(-1 * MAX_LOGS);
}

export function filterLogs(logs: Log[], processUUID: string) {
  return logs.filter(
    ev =>
      !processUUID || processUUID === "ALL" || ev.process_uuid === processUUID,
  );
}

export function getAllProcessUUIDs(logs: Log[]) {
  const uuids = new Set<string>();
  logs.forEach(log => uuids.add(log.process_uuid));
  return [...uuids].filter(Boolean).sort();
}

function memoizeOne<T, U>(fn: (input: T) => U) {
  let prevInput: T;
  let prevOutput: U;

  function memoizedFn(input: T) {
    if (prevInput === input) {
      return prevOutput;
    }
    prevInput = input;
    prevOutput = fn(input);
    return prevOutput;
  }
  return memoizedFn;
}

const formatTs = memoizeOne((ts: number) => dayjs(ts).format());

export function formatLog(log: Log) {
  const timestamp = formatTs(log.timestamp);
  const uuid = log.process_uuid || "---";
  return [
    `[${uuid}] ${timestamp} ${log.level} ${log.fqns} ${log.msg}`,
    ...(log.exception || []),
  ];
}
