import type { Location } from "history";

import type { JobListParams } from "metabase-enterprise/transforms/types";

import {
  parseInteger,
  parseList,
  parseRunStatus,
  parseString,
} from "../../utils";

export function getParsedParams(location: Location): JobListParams {
  const {
    transformTagIds,
    lastRunStartTime,
    lastRunStatuses,
    nextRunStartTime,
  } = location.query;

  return {
    lastRunStartTime: parseString(lastRunStartTime),
    lastRunStatuses: parseList(lastRunStatuses, parseRunStatus),
    nextRunStartTime: parseString(nextRunStartTime),
    transformTagIds: parseList(transformTagIds, parseInteger),
  };
}

export function hasFilterParams(params: JobListParams) {
  return (
    params.lastRunStartTime != null ||
    params.nextRunStartTime != null ||
    params.transformTagIds != null
  );
}
