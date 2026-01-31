import type { Location } from "history";

import * as Urls from "metabase/lib/urls";
import {
  SORT_DIRECTIONS,
  TRANSFORM_RUN_METHODS,
  TRANSFORM_RUN_SORT_COLUMNS,
  TRANSFORM_RUN_STATUSES,
} from "metabase-types/api";

export function getParsedParams(
  location: Location,
): Urls.TransformRunListParams {
  const {
    page,
    statuses,
    "transform-ids": transformIds,
    "transform-tag-ids": transformTagIds,
    "start-time": startTime,
    "end-time": endTime,
    "run-methods": runMethods,
    "sort-column": sortColumn,
    "sort-direction": sortDirection,
  } = location.query;

  return {
    page: Urls.parseNumberParam(page),
    statuses: Urls.parseListParam(statuses, (v) =>
      Urls.parseEnumParam(v, TRANSFORM_RUN_STATUSES),
    ),
    transformIds: Urls.parseListParam(transformIds, Urls.parseNumberParam),
    transformTagIds: Urls.parseListParam(
      transformTagIds,
      Urls.parseNumberParam,
    ),
    startTime: Urls.parseStringParam(startTime),
    endTime: Urls.parseStringParam(endTime),
    runMethods: Urls.parseListParam(runMethods, (v) =>
      Urls.parseEnumParam(v, TRANSFORM_RUN_METHODS),
    ),
    sortColumn: Urls.parseEnumParam(sortColumn, TRANSFORM_RUN_SORT_COLUMNS),
    sortDirection: Urls.parseEnumParam(sortDirection, SORT_DIRECTIONS),
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
