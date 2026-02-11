import type { Location } from "history";

import * as Urls from "metabase/lib/urls";
import {
  SORT_DIRECTIONS,
  TRANSFORM_RUN_METHODS,
  TRANSFORM_RUN_SORT_COLUMNS,
  TRANSFORM_RUN_STATUSES,
} from "metabase-types/api";

import type {
  TransformRunFilterOptions,
  TransformRunSortOptions,
} from "./types";

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

export function hasFilterOptions(options: TransformRunFilterOptions) {
  return (
    options.statuses != null ||
    options.transformIds != null ||
    options.transformTagIds != null ||
    options.startTime != null ||
    options.endTime != null ||
    options.runMethods != null
  );
}

export function getFilterOptions(
  params: Urls.TransformRunListParams,
): TransformRunFilterOptions {
  return {
    statuses: params.statuses,
    transformIds: params.transformIds,
    transformTagIds: params.transformTagIds,
    startTime: params.startTime,
    endTime: params.endTime,
    runMethods: params.runMethods,
  };
}

export function getSortOptions(
  params: Urls.TransformRunListParams,
): TransformRunSortOptions | undefined {
  return params.sortColumn != null && params.sortDirection != null
    ? { column: params.sortColumn, direction: params.sortDirection }
    : undefined;
}
