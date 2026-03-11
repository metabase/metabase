import type * as Urls from "metabase/lib/urls";

import { DEFAULT_INCLUDE_PERSONAL_COLLECTIONS } from "../../constants";
import type {
  DependencyFilterOptions,
  DependencySortOptions,
} from "../../types";

import { BROKEN_GROUP_TYPES, UNREFERENCED_GROUP_TYPES } from "./constants";
import type { DependencyDiagnosticsMode } from "./types";

export function getAvailableGroupTypes(mode: DependencyDiagnosticsMode) {
  return mode === "broken" ? BROKEN_GROUP_TYPES : UNREFERENCED_GROUP_TYPES;
}

export function getFilterOptions(
  mode: DependencyDiagnosticsMode,
  {
    groupTypes = getAvailableGroupTypes(mode),
    includePersonalCollections = DEFAULT_INCLUDE_PERSONAL_COLLECTIONS,
  }: Urls.DependencyDiagnosticsParams,
): DependencyFilterOptions {
  return {
    groupTypes,
    includePersonalCollections,
  };
}

export function getDefaultFilterOptions(
  mode: DependencyDiagnosticsMode,
): DependencyFilterOptions {
  return getFilterOptions(mode, {});
}

export function getSortOptions({
  sortColumn,
  sortDirection,
}: Urls.DependencyDiagnosticsParams): DependencySortOptions | undefined {
  return sortColumn != null && sortDirection != null
    ? { column: sortColumn, direction: sortDirection }
    : undefined;
}

export function getParamsWithoutDefaults(
  mode: DependencyDiagnosticsMode,
  {
    page,
    groupTypes,
    includePersonalCollections,
    ...params
  }: Urls.DependencyDiagnosticsParams,
): Urls.DependencyDiagnosticsParams {
  const defaultGroupTypes = getAvailableGroupTypes(mode);

  return {
    ...params,
    page: page === 0 ? undefined : page,
    groupTypes:
      groupTypes?.length === defaultGroupTypes.length ? undefined : groupTypes,
    includePersonalCollections:
      includePersonalCollections === DEFAULT_INCLUDE_PERSONAL_COLLECTIONS
        ? undefined
        : includePersonalCollections,
  };
}
