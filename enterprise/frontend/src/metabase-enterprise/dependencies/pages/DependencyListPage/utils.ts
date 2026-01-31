import * as Urls from "metabase/lib/urls";
import {
  DEPENDENCY_GROUP_TYPES,
  DEPENDENCY_SORT_COLUMNS,
  type DependencyListUserParams,
  SORT_DIRECTIONS,
} from "metabase-types/api";

import type { DependencyListMode } from "../../components/DependencyList/types";

import type { DependencyListQueryParams } from "./types";

export function getPageUrl(
  mode: DependencyListMode,
  params: Urls.DependencyListParams,
): string {
  return mode === "broken"
    ? Urls.brokenDependencies(params)
    : Urls.unreferencedDependencies(params);
}

export function parseUrlParams(
  params: DependencyListQueryParams,
): Urls.DependencyListParams {
  return {
    page: Urls.parseNumberParam(params.page),
    query: Urls.parseStringParam(params.query),
    group_types: Urls.parseListParam(params.group_types, (item) =>
      Urls.parseEnumParam(item, DEPENDENCY_GROUP_TYPES),
    ),
    include_personal_collections: Urls.parseBooleanParam(
      params.include_personal_collections,
    ),
    sort_column: Urls.parseEnumParam(
      params.sort_column,
      DEPENDENCY_SORT_COLUMNS,
    ),
    sort_direction: Urls.parseEnumParam(params.sort_direction, SORT_DIRECTIONS),
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
