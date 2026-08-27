import type { Location } from "metabase/router";
import * as Urls from "metabase/urls";
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
  const searchParams = new URLSearchParams(location.search);

  return {
    page: Urls.parseNumberParam(searchParams.get("page")),
    statuses: Urls.parseListParam(searchParams.getAll("statuses"), (v) =>
      Urls.parseEnumParam(v, TRANSFORM_RUN_STATUSES),
    ),
    transformIds: Urls.parseListParam(
      searchParams.getAll("transform-ids"),
      Urls.parseNumberParam,
    ),
    transformTagIds: Urls.parseListParam(
      searchParams.getAll("transform-tag-ids"),
      Urls.parseNumberParam,
    ),
    startTime: Urls.parseStringParam(searchParams.get("start-time")),
    endTime: Urls.parseStringParam(searchParams.get("end-time")),
    runMethods: Urls.parseListParam(searchParams.getAll("run-methods"), (v) =>
      Urls.parseEnumParam(v, TRANSFORM_RUN_METHODS),
    ),
    sortColumn: Urls.parseEnumParam(
      searchParams.get("sort-column"),
      TRANSFORM_RUN_SORT_COLUMNS,
    ),
    sortDirection: Urls.parseEnumParam(
      searchParams.get("sort-direction"),
      SORT_DIRECTIONS,
    ),
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
