import type { Location } from "history";

import type * as Urls from "metabase/lib/urls";

import {
  parseInteger,
  parseList,
  parseRunStatus,
  parseString,
} from "../../utils";

export function getParsedParams(location: Location): Urls.TransformListParams {
  const { lastRunStartTime, lastRunStatuses, tagIds } = location.query;

  return {
    lastRunStartTime: parseString(lastRunStartTime),
    lastRunStatuses: parseList(lastRunStatuses, parseRunStatus),
    tagIds: parseList(tagIds, parseInteger),
  };
}

export function hasFilterParams(params: Urls.TransformListParams) {
  return (
    params.lastRunStartTime != null ||
    params.lastRunStatuses != null ||
    params.tagIds != null
  );
}
