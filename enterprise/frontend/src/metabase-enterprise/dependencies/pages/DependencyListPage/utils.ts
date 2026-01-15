import type * as Urls from "metabase/lib/urls";
import {
  DEPENDENCY_GROUP_TYPES,
  DEPENDENCY_SORT_COLUMNS,
  DEPENDENCY_SORT_DIRECTIONS,
} from "metabase-types/api";

import {
  parseBoolean,
  parseEnum,
  parseList,
  parseNumber,
  parseString,
} from "../../utils";

import type { DependencyListQueryParams } from "./types";

export function parseParams(
  params: DependencyListQueryParams,
): Urls.DependencyListParams {
  const sortColumn = parseEnum(params["sort-column"], DEPENDENCY_SORT_COLUMNS);
  const sortDirection = parseEnum(
    params["sort-direction"],
    DEPENDENCY_SORT_DIRECTIONS,
  );

  return {
    query: parseString(params.query),
    groupTypes: parseList(params["group-types"], (item) =>
      parseEnum(item, DEPENDENCY_GROUP_TYPES),
    ),
    includePersonalCollections: parseBoolean(
      params["include-personal-collections"],
    ),
    sorting:
      sortColumn != null && sortDirection != null
        ? { column: sortColumn, direction: sortDirection }
        : undefined,
    page: parseNumber(params.page),
  };
}
