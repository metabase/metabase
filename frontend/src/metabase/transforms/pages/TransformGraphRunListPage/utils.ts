import type { Location } from "history";

import * as Urls from "metabase/urls";
import {
  SORT_DIRECTIONS,
  TRANSFORM_GRAPH_RUN_SORT_COLUMNS,
  TRANSFORM_GRAPH_RUN_TYPES,
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
  };
}

export function hasFilterOptions(
  options: TransformGraphRunFilterOptions,
): boolean {
  return (
    options.types != null ||
    options.statuses != null ||
    options.transformIds != null ||
    options.startTime != null
  );
}

export function getSortOptions(
  params: Urls.TransformGraphRunListParams,
): TransformGraphRunSortOptions | undefined {
  return params.sortColumn != null && params.sortDirection != null
    ? { column: params.sortColumn, direction: params.sortDirection }
    : undefined;
}
