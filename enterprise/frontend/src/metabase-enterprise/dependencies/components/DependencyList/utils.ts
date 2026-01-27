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
    group_types = defaultFilterOptions.groupTypes,
    include_personal_collections = defaultFilterOptions.includePersonalCollections,
  } = params;

  return {
    groupTypes: group_types,
    includePersonalCollections: include_personal_collections,
  };
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
  sort_column,
  sort_direction,
}: Urls.DependencyListParams): DependencySortOptions | undefined {
  return sort_column != null && sort_direction != null
    ? { column: sort_column, direction: sort_direction }
    : undefined;
}
