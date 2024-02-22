import dayjs from "dayjs";
import orderBy from "lodash.orderby";
import _ from "underscore";

import type { Log } from "metabase-types/api";

const MAX_LOGS = 50000;

function logEventKey(ev: Log) {
  return `${ev.timestamp}, ${ev.process_uuid}, ${ev.fqns}, ${ev.msg}`;
}

export function mergeLogs(logArrays: Log[][]) {
  let prevLogKey = "";
  return orderBy(
    logArrays.flat(),
    ["timestamp", "process_uuid", "msg"],
    ["asc", "asc", "asc"],
  )
    .filter(log => {
      const key = logEventKey(log);
      const keep = prevLogKey !== key;
      if (keep) {
        prevLogKey = key;
      }
      return keep;
    })
    .slice(-1 * MAX_LOGS);
}

export function maybeMergeLogs(logs: Log[], newLogs: Log[]) {
  const newestLog = _.first(newLogs);
  const hasFetchedNewLogs = newestLog && !hasLog(logs, newestLog);
  if (hasFetchedNewLogs) {
    return mergeLogs([logs, newLogs.reverse()]);
  }
  return logs;
}

export function hasLog(logs: Log[], targetLog: Log): boolean {
  // search from back as newer logs are last
  return _.findLastIndex(logs, targetLog) > -1;
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

const formatTs = (ts: number) => dayjs(ts).format();

// logs are sorted by time when we got to format them
// and many logs happen with in the same exact millisecond
// this helps avoid expensive format computation if curr
// value is the same as the last one
const memoedFormatTs = memoizeOne(formatTs);

export function formatLog(log: Log) {
  const timestamp = memoedFormatTs(log.timestamp);
  const uuid = log.process_uuid || "---";
  return [
    `[${uuid}] ${timestamp} ${log.level} ${log.fqns} ${log.msg}`,
    ...(log.exception || []),
  ];
}
