import type { Location } from "history";

import type * as Urls from "metabase/lib/urls";

import {
  parseInteger,
  parseList,
  parseRunStatus,
  parseString,
} from "../../utils";

export function getParsedParams(
  location: Location,
): Urls.TransformJobListParams {
  const { lastRunStartTime, lastRunStatuses, nextRunStartTime, tagIds } =
    location.query;

  return {
    lastRunStartTime: parseString(lastRunStartTime),
    lastRunStatuses: parseList(lastRunStatuses, parseRunStatus),
    nextRunStartTime: parseString(nextRunStartTime),
    tagIds: parseList(tagIds, parseInteger),
  };
}

export function hasFilterParams(params: Urls.TransformJobListParams) {
  return (
    params.lastRunStartTime != null ||
    params.lastRunStatuses != null ||
    params.nextRunStartTime != null ||
    params.tagIds != null
  );
}
