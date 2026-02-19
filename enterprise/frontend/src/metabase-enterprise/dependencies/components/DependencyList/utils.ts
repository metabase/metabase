import type * as Urls from "metabase/lib/urls";

import { DEFAULT_INCLUDE_PERSONAL_COLLECTIONS } from "../../constants";
import type {
  DependencyFilterOptions,
  DependencySortOptions,
} from "../../types";

import { BROKEN_GROUP_TYPES, UNREFERENCED_GROUP_TYPES } from "./constants";
import type { DependencyListMode } from "./types";

export function getAvailableGroupTypes(mode: DependencyListMode) {
  return mode === "broken" ? BROKEN_GROUP_TYPES : UNREFERENCED_GROUP_TYPES;
}

export function getFilterOptions(
  mode: DependencyListMode,
  {
    groupTypes = getAvailableGroupTypes(mode),
    includePersonalCollections = DEFAULT_INCLUDE_PERSONAL_COLLECTIONS,
  }: Urls.DependencyListParams,
): DependencyFilterOptions {
  return {
    groupTypes,
    includePersonalCollections,
  };
}

export function getDefaultFilterOptions(
  mode: DependencyListMode,
): DependencyFilterOptions {
  return getFilterOptions(mode, {});
}

export function getSortOptions({
  sortColumn,
  sortDirection,
}: Urls.DependencyListParams): DependencySortOptions | undefined {
  return sortColumn != null && sortDirection != null
    ? { column: sortColumn, direction: sortDirection }
    : undefined;
}

export function getParamsWithoutDefaults(
  mode: DependencyListMode,
  {
    page,
    groupTypes,
    includePersonalCollections,
    ...params
  }: Urls.DependencyListParams,
): Urls.DependencyListParams {
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
