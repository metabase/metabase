import * as Urls from "metabase/urls";
import type { DependencyDiagnosticsMode } from "metabase-enterprise/monitor/dependency-diagnostics/components/types";
import {
  DEPENDENCY_GROUP_TYPES,
  DEPENDENCY_SORT_COLUMNS,
  type DependencyDiagnosticsUserParams,
  SORT_DIRECTIONS,
} from "metabase-types/api";

export function getPageUrl(
  mode: DependencyDiagnosticsMode,
  params: Urls.DependencyDiagnosticsParams,
): string {
  return mode === "broken"
    ? Urls.brokenDependencies(params)
    : Urls.unreferencedDependencies(params);
}

export function parseUrlParams(
  searchParams: URLSearchParams,
): Urls.DependencyDiagnosticsParams {
  return {
    page: Urls.parseNumberParam(searchParams.get("page")),
    query: Urls.parseStringParam(searchParams.get("query")),
    groupTypes: Urls.parseListParam(
      searchParams.getAll("group-types"),
      (item) => Urls.parseEnumParam(item, DEPENDENCY_GROUP_TYPES),
    ),
    includePersonalCollections: Urls.parseBooleanParam(
      searchParams.get("include-personal-collections"),
    ),
    sortColumn: Urls.parseEnumParam(
      searchParams.get("sort-column"),
      DEPENDENCY_SORT_COLUMNS,
    ),
    sortDirection: Urls.parseEnumParam(
      searchParams.get("sort-direction"),
      SORT_DIRECTIONS,
    ),
  };
}

// when the value is not previously set, the BE returns an empty string
export function parseUserParams(
  params: DependencyDiagnosticsUserParams | undefined | "",
): Urls.DependencyDiagnosticsParams {
  if (typeof params !== "object" || params == null) {
    return {};
  }

  return {
    groupTypes: params.group_types,
    includePersonalCollections: params.include_personal_collections,
    sortColumn: params.sort_column,
    sortDirection: params.sort_direction,
  };
}

export function getUserParams(
  params: Urls.DependencyDiagnosticsParams,
): DependencyDiagnosticsUserParams {
  return {
    group_types: params.groupTypes,
    include_personal_collections: params.includePersonalCollections,
    sort_column: params.sortColumn,
    sort_direction: params.sortDirection,
  };
}

export function isEmptyParams(searchParams: URLSearchParams): boolean {
  return [...searchParams.keys()].length === 0;
}
