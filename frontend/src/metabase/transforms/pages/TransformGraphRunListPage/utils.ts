import type { Location } from "history";

import * as Urls from "metabase/urls";
import {
  SORT_DIRECTIONS,
  TRANSFORM_GRAPH_RUN_SORT_COLUMNS,
  TRANSFORM_GRAPH_RUN_TYPES,
  TRANSFORM_RUN_METHODS,
  TRANSFORM_RUN_STATUSES,
} from "metabase-types/api";

import type {
  TransformGraphRunFilterOptions,
  TransformGraphRunSortOptions,
} from "./types";

export function getParsedParams(
  location: Location,
): Urls.TransformGraphRunListParams {
  const {
    page,
    types,
    statuses,
    "transform-ids": transformIds,
    "start-time": startTime,
    "end-time": endTime,
    "run-methods": runMethods,
    "sort-column": sortColumn,
    "sort-direction": sortDirection,
  } = location.query;

  return {
    page: Urls.parseNumberParam(page),
    types: Urls.parseListParam(types, (v) =>
      Urls.parseEnumParam(v, TRANSFORM_GRAPH_RUN_TYPES),
    ),
    statuses: Urls.parseListParam(statuses, (v) =>
      Urls.parseEnumParam(v, TRANSFORM_RUN_STATUSES),
    ),
    transformIds: Urls.parseListParam(transformIds, Urls.parseNumberParam),
    startTime: Urls.parseStringParam(startTime),
    endTime: Urls.parseStringParam(endTime),
    runMethods: Urls.parseListParam(runMethods, (v) =>
      Urls.parseEnumParam(v, TRANSFORM_RUN_METHODS),
    ),
    sortColumn: Urls.parseEnumParam(
      sortColumn,
      TRANSFORM_GRAPH_RUN_SORT_COLUMNS,
    ),
    sortDirection: Urls.parseEnumParam(sortDirection, SORT_DIRECTIONS),
  };
}

export function getFilterOptions(
  params: Urls.TransformGraphRunListParams,
): TransformGraphRunFilterOptions {
  return {
    types: params.types,
    statuses: params.statuses,
    transformIds: params.transformIds,
    startTime: params.startTime,
    endTime: params.endTime,
    runMethods: params.runMethods,
  };
}

export function hasFilterOptions(
  options: TransformGraphRunFilterOptions,
): boolean {
  return (
    options.types != null ||
    options.statuses != null ||
    options.transformIds != null ||
    options.startTime != null ||
    options.endTime != null ||
    options.runMethods != null
  );
}

export function getSortOptions(
  params: Urls.TransformGraphRunListParams,
): TransformGraphRunSortOptions | undefined {
  return params.sortColumn != null && params.sortDirection != null
    ? { column: params.sortColumn, direction: params.sortDirection }
    : undefined;
}
