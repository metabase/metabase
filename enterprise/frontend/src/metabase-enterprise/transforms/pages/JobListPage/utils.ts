import type { Location } from "history";

import type { JobListParams } from "metabase-enterprise/transforms/types";

import {
  parseInteger,
  parseList,
  parseRunStatus,
  parseString,
} from "../../utils";

export function getParsedParams(location: Location): JobListParams {
  const { lastRunStartTime, lastRunStatuses, nextRunStartTime, tagIds } =
    location.query;

  return {
    lastRunStartTime: parseString(lastRunStartTime),
    lastRunStatuses: parseList(lastRunStatuses, parseRunStatus),
    nextRunStartTime: parseString(nextRunStartTime),
    tagIds: parseList(tagIds, parseInteger),
  };
}

export function hasFilterParams(params: JobListParams) {
  return (
    params.lastRunStartTime != null ||
    params.lastRunStatuses != null ||
    params.nextRunStartTime != null ||
    params.tagIds != null
  );
}
