import dayjs from "dayjs";
import orderBy from "lodash.orderby";
import _ from "underscore";

import {
  type QueryParam,
  type UrlStateConfig,
  getFirstParamValue,
} from "metabase/common/hooks/use-url-state";
import type { Log } from "metabase-types/api";

const MAX_LOGS = 50000;

type UrlState = {
  process: string | "ALL";
  query: string;
};

export const urlStateConfig: UrlStateConfig<UrlState> = {
  parse: (query) => ({
    process: parseProcess(query.process),
    query: parseQuery(query.query),
  }),
  serialize: ({ process, query }) => ({
    process: process === "ALL" ? undefined : process,
    query: query.length === 0 ? undefined : query,
  }),
};

function parseProcess(param: QueryParam): UrlState["process"] {
  const value = getFirstParamValue(param);
  return value && value.trim().length > 0 ? value.trim() : "ALL";
}

function parseQuery(param: QueryParam): UrlState["query"] {
  const value = getFirstParamValue(param);
  return value ?? "";
}

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
    .filter((log) => {
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

export function filterLogs(logs: Log[], { process, query }: UrlState) {
  const lowerCaseQuery = query ? query.toLowerCase() : "";

  return logs.filter((log) => {
    const formattedLog = formatLog(log).join("\n");

    const matchesProcessFilter =
      !process || process === "ALL" || log.process_uuid === process;
    const matchesQueryFilter = formattedLog
      .toLowerCase()
      .includes(lowerCaseQuery);

    return matchesProcessFilter && matchesQueryFilter;
  });
}

export function getAllProcessUUIDs(logs: Log[]) {
  const uuids = new Set<string>();
  logs.forEach((log) => uuids.add(log.process_uuid));
  return [...uuids].filter(Boolean).sort();
}

// date formatting is expensive for megabytes of logs
const formatTs = (ts: string) => dayjs(ts).format();
const memoedFormatTs = _.memoize(formatTs);

export function formatLog(log: Log) {
  const timestamp = memoedFormatTs(log.timestamp);
  const uuid = log.process_uuid || "---";
  return [
    `[${uuid}] ${timestamp} ${log.level} ${log.fqns} ${log.msg}`,
    ...(log.exception || []),
  ];
}
