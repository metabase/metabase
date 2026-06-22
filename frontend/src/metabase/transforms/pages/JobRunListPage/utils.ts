import type { Location } from "history";

import * as Urls from "metabase/urls";
import {
  SORT_DIRECTIONS,
  TRANSFORM_JOB_RUN_SORT_COLUMNS,
  TRANSFORM_JOB_RUN_STATUSES,
  TRANSFORM_RUN_METHODS,
} from "metabase-types/api";

import type { JobRunSortOptions } from "./types";

export function getParsedParams(
  location: Location,
): Urls.TransformJobRunListParams {
  const {
    page,
    status,
    "run-method": runMethod,
    "start-time": startTime,
    "sort-column": sortColumn,
    "sort-direction": sortDirection,
  } = location.query;

  return {
    page: Urls.parseNumberParam(page),
    status: Urls.parseEnumParam(status, TRANSFORM_JOB_RUN_STATUSES),
    runMethod: Urls.parseEnumParam(runMethod, TRANSFORM_RUN_METHODS),
    startTime: Urls.parseStringParam(startTime),
    sortColumn: Urls.parseEnumParam(sortColumn, TRANSFORM_JOB_RUN_SORT_COLUMNS),
    sortDirection: Urls.parseEnumParam(sortDirection, SORT_DIRECTIONS),
  };
}

export function getSortOptions(
  params: Urls.TransformJobRunListParams,
): JobRunSortOptions | undefined {
  return params.sortColumn != null && params.sortDirection != null
    ? { column: params.sortColumn, direction: params.sortDirection }
    : undefined;
}
