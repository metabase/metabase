import type { Location } from "history";

import type { RunListParams } from "metabase-enterprise/transforms/types";

import {
  parseInteger,
  parseListFromUrl,
  parseRunMethod,
  parseRunStatus,
  parseString,
} from "../../utils";

export function getParsedParams(location: Location): RunListParams {
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
    statuses: parseListFromUrl(statuses, parseRunStatus),
    transformIds: parseListFromUrl(transformIds, parseInteger),
    transformTagIds: parseListFromUrl(transformTagIds, parseInteger),
    startTime: parseString(startTime),
    endTime: parseString(endTime),
    runMethods: parseListFromUrl(runMethods, parseRunMethod),
  };
}

export function hasFilterParams(params: RunListParams) {
  return (
    params.statuses != null ||
    params.transformIds != null ||
    params.transformTagIds != null ||
    params.startTime != null ||
    params.endTime != null ||
    params.runMethods != null
  );
}
