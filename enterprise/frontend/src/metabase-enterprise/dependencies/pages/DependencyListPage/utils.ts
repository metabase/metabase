import * as Urls from "metabase/lib/urls";
import {
  DEPENDENCY_GROUP_TYPES,
  DEPENDENCY_SORT_COLUMNS,
  DEPENDENCY_SORT_DIRECTIONS,
  type DependencyListUserParams,
} from "metabase-types/api";

import type { DependencyListMode } from "../../components/DependencyList/types";
import {
  parseBoolean,
  parseEnum,
  parseList,
  parseNumber,
  parseString,
} from "../../utils";

import type { DependencyListQueryParams } from "./types";

export function getPageUrl(
  mode: DependencyListMode,
  params: Urls.DependencyListParams,
): string {
  return mode === "breaking"
    ? Urls.breakingDependencies(params)
    : Urls.unreferencedDependencies(params);
}

export function parseUrlParams(
  params: DependencyListQueryParams,
): Urls.DependencyListParams {
  return {
    page: parseNumber(params.page),
    query: parseString(params.query),
    group_types: parseList(params.group_types, (item) =>
      parseEnum(item, DEPENDENCY_GROUP_TYPES),
    ),
    include_personal_collections: parseBoolean(
      params.include_personal_collections,
    ),
    sort_column: parseEnum(params.sort_column, DEPENDENCY_SORT_COLUMNS),
    sort_direction: parseEnum(
      params.sort_direction,
      DEPENDENCY_SORT_DIRECTIONS,
    ),
  };
}

// when the value is not previously set, the BE returns an empty string
export function parseUserParams(
  params: DependencyListUserParams | undefined | "",
): Urls.DependencyListParams {
  return typeof params === "object" && params != null ? params : {};
}

export function getUserParams(
  params: Urls.DependencyListParams,
): DependencyListUserParams {
  return {
    group_types: params.group_types,
    include_personal_collections: params.include_personal_collections,
    sort_column: params.sort_column,
    sort_direction: params.sort_direction,
  };
}

export function isEmptyParams(params: DependencyListQueryParams): boolean {
  return Object.values(params).every((value) => value == null);
}
