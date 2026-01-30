import type * as Urls from "metabase/lib/urls";

import { DEFAULT_INCLUDE_PERSONAL_COLLECTIONS } from "../../constants";
import type {
  DependencyFilterOptions,
  DependencySortOptions,
} from "../../types";

import { BROKEN_GROUP_TYPES, UNREFERENCED_GROUP_TYPES } from "./constants";
import type { DependencyListMode } from "./types";

export function getAvailableGroupTypes(mode: DependencyListMode) {
  return mode === "breaking" ? BROKEN_GROUP_TYPES : UNREFERENCED_GROUP_TYPES;
}

export function getFilterOptions(
  mode: DependencyListMode,
  {
    group_types = getAvailableGroupTypes(mode),
    include_personal_collections = DEFAULT_INCLUDE_PERSONAL_COLLECTIONS,
  }: Urls.DependencyListParams,
): DependencyFilterOptions {
  return {
    groupTypes: group_types,
    includePersonalCollections: include_personal_collections,
  };
}

export function getDefaultFilterOptions(
  mode: DependencyListMode,
): DependencyFilterOptions {
  return getFilterOptions(mode, {});
}

export function getSortOptions({
  sort_column,
  sort_direction,
}: Urls.DependencyListParams): DependencySortOptions | undefined {
  return sort_column != null && sort_direction != null
    ? { column: sort_column, direction: sort_direction }
    : undefined;
}

export function getParamsWithoutDefaults(
  mode: DependencyListMode,
  {
    page,
    group_types,
    include_personal_collections,
    ...params
  }: Urls.DependencyListParams,
): Urls.DependencyListParams {
  const defaultGroupTypes = getAvailableGroupTypes(mode);

  return {
    ...params,
    page: page === 0 ? undefined : page,
    group_types:
      group_types?.length === defaultGroupTypes.length
        ? undefined
        : group_types,
    include_personal_collections:
      include_personal_collections === DEFAULT_INCLUDE_PERSONAL_COLLECTIONS
        ? undefined
        : include_personal_collections,
  };
}
