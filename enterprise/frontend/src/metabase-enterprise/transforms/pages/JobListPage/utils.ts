import type { Location } from "history";

import type { JobListParams } from "metabase-enterprise/transforms/types";

import {
  parseListFromUrl,
  parseNumberFromUrl,
  parseRunStatusFromUrl,
  parseStringFromUrl,
} from "../../utils";

export function getParsedParams(location: Location): JobListParams {
  const {
    transformTagIds,
    lastRunStartTime,
    lastRunStatuses,
    nextRunStartTime,
  } = location.query;

  return {
    lastRunStartTime: parseStringFromUrl(lastRunStartTime),
    lastRunStatuses: parseListFromUrl(lastRunStatuses, parseRunStatusFromUrl),
    nextRunStartTime: parseStringFromUrl(nextRunStartTime),
    transformTagIds: parseListFromUrl(transformTagIds, parseNumberFromUrl),
  };
}

export function hasFilterParams(params: JobListParams) {
  return (
    params.lastRunStartTime != null ||
    params.nextRunStartTime != null ||
    params.transformTagIds != null
  );
}
