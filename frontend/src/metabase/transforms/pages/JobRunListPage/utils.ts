import type { Location } from "metabase/router";
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
  const searchParams = new URLSearchParams(location.search);

  return {
    page: Urls.parseNumberParam(searchParams.get("page")),
    status: Urls.parseEnumParam(
      searchParams.get("status"),
      TRANSFORM_JOB_RUN_STATUSES,
    ),
    runMethod: Urls.parseEnumParam(
      searchParams.get("run-method"),
      TRANSFORM_RUN_METHODS,
    ),
    startTime: Urls.parseStringParam(searchParams.get("start-time")),
    sortColumn: Urls.parseEnumParam(
      searchParams.get("sort-column"),
      TRANSFORM_JOB_RUN_SORT_COLUMNS,
    ),
    sortDirection: Urls.parseEnumParam(
      searchParams.get("sort-direction"),
      SORT_DIRECTIONS,
    ),
  };
}

export function getSortOptions(
  params: Urls.TransformJobRunListParams,
): JobRunSortOptions | undefined {
  return params.sortColumn != null && params.sortDirection != null
    ? { column: params.sortColumn, direction: params.sortDirection }
    : undefined;
}
