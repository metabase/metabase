import type { Location } from "metabase/router";
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
  const searchParams = new URLSearchParams(location.search);

  return {
    page: Urls.parseNumberParam(searchParams.get("page")),
    types: Urls.parseListParam(searchParams.getAll("types"), (v) =>
      Urls.parseEnumParam(v, TRANSFORM_GRAPH_RUN_TYPES),
    ),
    statuses: Urls.parseListParam(searchParams.getAll("statuses"), (v) =>
      Urls.parseEnumParam(v, TRANSFORM_RUN_STATUSES),
    ),
    transformIds: Urls.parseListParam(
      searchParams.getAll("transform-ids"),
      Urls.parseNumberParam,
    ),
    startTime: Urls.parseStringParam(searchParams.get("start-time")),
    endTime: Urls.parseStringParam(searchParams.get("end-time")),
    runMethods: Urls.parseListParam(searchParams.getAll("run-methods"), (v) =>
      Urls.parseEnumParam(v, TRANSFORM_RUN_METHODS),
    ),
    sortColumn: Urls.parseEnumParam(
      searchParams.get("sort-column"),
      TRANSFORM_GRAPH_RUN_SORT_COLUMNS,
    ),
    sortDirection: Urls.parseEnumParam(
      searchParams.get("sort-direction"),
      SORT_DIRECTIONS,
    ),
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
