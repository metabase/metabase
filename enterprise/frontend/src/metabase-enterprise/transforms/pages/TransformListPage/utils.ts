import type { Location } from "history";

import type { TransformListParams } from "metabase-enterprise/transforms/types";

import {
  parseInteger,
  parseList,
  parseRunStatus,
  parseString,
} from "../../utils";

export function getParsedParams(location: Location): TransformListParams {
  if (!location.query) {
    return {};
  }
  const { lastRunStartTime, lastRunStatuses, tagIds } = location.query;

  return {
    lastRunStartTime: parseString(lastRunStartTime),
    lastRunStatuses: parseList(lastRunStatuses, parseRunStatus),
    tagIds: parseList(tagIds, parseInteger),
  };
}

export function hasFilterParams(params: TransformListParams) {
  return (
    params.lastRunStartTime != null ||
    params.lastRunStatuses != null ||
    params.tagIds != null
  );
}
