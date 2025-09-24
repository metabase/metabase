import type { Location } from "history";

import type { RunListParams } from "metabase-enterprise/transforms/types";

import {
  parseListFromUrl,
  parseNumberFromUrl,
  parseRunMethodFromUrl,
  parseRunStatusFromUrl,
  parseStringFromUrl,
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
    page: parseNumberFromUrl(page),
    statuses: parseListFromUrl(statuses, parseRunStatusFromUrl),
    transformIds: parseListFromUrl(transformIds, parseNumberFromUrl),
    transformTagIds: parseListFromUrl(transformTagIds, parseNumberFromUrl),
    startTime: parseStringFromUrl(startTime),
    endTime: parseStringFromUrl(endTime),
    runMethods: parseListFromUrl(runMethods, parseRunMethodFromUrl),
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
