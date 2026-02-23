import * as Urls from "metabase/lib/urls";
import {
  DEPENDENCY_GROUP_TYPES,
  DEPENDENCY_SORT_COLUMNS,
  type DependencyDiagnosticsUserParams,
  SORT_DIRECTIONS,
} from "metabase-types/api";

import type { DependencyDiagnosticsMode } from "../../components/DependencyDiagnostics/types";

type SearchLocation = {
  search: string;
};

export function getPageUrl(
  mode: DependencyDiagnosticsMode,
  params: Urls.DependencyDiagnosticsParams,
): string {
  return mode === "broken"
    ? Urls.brokenDependencies(params)
    : Urls.unreferencedDependencies(params);
}

export function parseUrlParams(
  location: SearchLocation,
): Urls.DependencyDiagnosticsParams {
  const queryParams = Object.fromEntries(new URLSearchParams(location.search));
  const {
    page,
    query,
    "group-types": groupTypes,
    "include-personal-collections": includePersonalCollections,
    "sort-column": sortColumn,
    "sort-direction": sortDirection,
  } = queryParams;

  return {
    page: Urls.parseNumberParam(page),
    query: Urls.parseStringParam(query),
    groupTypes: Urls.parseListParam(groupTypes, (item) =>
      Urls.parseEnumParam(item, DEPENDENCY_GROUP_TYPES),
    ),
    includePersonalCollections: Urls.parseBooleanParam(
      includePersonalCollections,
    ),
    sortColumn: Urls.parseEnumParam(sortColumn, DEPENDENCY_SORT_COLUMNS),
    sortDirection: Urls.parseEnumParam(sortDirection, SORT_DIRECTIONS),
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

export function isEmptyParams(location: SearchLocation): boolean {
  return new URLSearchParams(location.search).toString().length === 0;
}
