import type { Location } from "history";

import type * as Urls from "metabase/lib/urls";

import {
  parseInteger,
  parseList,
  parseRunMethod,
  parseRunStatus,
  parseString,
} from "../../utils";

export function getParsedParams(
  location: Location,
): Urls.TransformRunListParams {
  const {
    page,
    statuses,
    transformIds,
    transformTagIds,
    startTime,
    endTime,
    runMethods,
  } = location.query;
  return {
    page: parseInteger(page),
    statuses: parseList(statuses, parseRunStatus),
    transformIds: parseList(transformIds, parseInteger),
    transformTagIds: parseList(transformTagIds, parseInteger),
    startTime: parseString(startTime),
    endTime: parseString(endTime),
    runMethods: parseList(runMethods, parseRunMethod),
  };
}

export function hasFilterParams(params: Urls.TransformRunListParams) {
  return (
    params.statuses != null ||
    params.transformIds != null ||
    params.transformTagIds != null ||
    params.startTime != null ||
    params.endTime != null ||
    params.runMethods != null
  );
}
