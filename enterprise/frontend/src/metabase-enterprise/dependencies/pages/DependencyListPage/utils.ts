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
  return {
    page: parseNumber(params.page),
    query: parseString(params.query),
    groupTypes: parseList(params.group_types, (item) =>
      parseEnum(item, DEPENDENCY_GROUP_TYPES),
    ),
    includePersonalCollections: parseBoolean(
      params.include_personal_collections,
    ),
    sortColumn: parseEnum(params.sort_column, DEPENDENCY_SORT_COLUMNS),
    sortDirection: parseEnum(params.sort_direction, DEPENDENCY_SORT_DIRECTIONS),
  };
}
