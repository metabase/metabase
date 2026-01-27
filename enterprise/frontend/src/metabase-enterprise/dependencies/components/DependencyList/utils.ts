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
  params: Urls.DependencyListParams = {},
): DependencyFilterOptions {
  const defaultFilterOptions = getDefaultFilterOptions(mode);
  const {
    groupTypes = defaultFilterOptions.groupTypes,
    includePersonalCollections = defaultFilterOptions.includePersonalCollections,
  } = params;

  return { groupTypes, includePersonalCollections };
}

export function getDefaultFilterOptions(
  mode: DependencyListMode,
): DependencyFilterOptions {
  return {
    groupTypes: getAvailableGroupTypes(mode),
    includePersonalCollections: DEFAULT_INCLUDE_PERSONAL_COLLECTIONS,
  };
}

export function getSortOptions({
  sortColumn,
  sortDirection,
}: Urls.DependencyListParams): DependencySortOptions | undefined {
  return sortColumn != null && sortDirection != null
    ? { column: sortColumn, direction: sortDirection }
    : undefined;
}
