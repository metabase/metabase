import orderBy from "lodash.orderby";
import _ from "underscore";

import {
  type QueryParam,
  type UrlStateConfig,
  getFirstParamValue,
} from "metabase/common/hooks/use-url-state";
import { createLogFormatter } from "metabase/monitor/components/LogsViewer/utils";
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
    return mergeLogs([logs, newLogs.toReversed()]);
  }
  return logs;
}

export function hasLog(logs: Log[], targetLog: Log): boolean {
  // search from back as newer logs are last
  return _.findLastIndex(logs, targetLog) > -1;
}

export function filterLogs(
  logs: Log[],
  { process, query }: UrlState,
  processUUIDs: string[] = [],
) {
  const lowerCaseQuery = query ? query.toLowerCase() : "";
  const formatLog = createLogFormatter(process, processUUIDs);

  return logs.filter((log) => {
    const matchesProcessFilter =
      !process || process === "ALL" || log.process_uuid === process;
    // only search on text visible to the user to avoid matching hidden data (e.g. process UUID)
    const matchesQueryFilter = formatLog(log)
      .join("\n")
      .toLowerCase()
      .includes(lowerCaseQuery);

    return matchesProcessFilter && matchesQueryFilter;
  });
}
