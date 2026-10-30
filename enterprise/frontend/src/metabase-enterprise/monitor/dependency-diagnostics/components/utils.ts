import type * as Urls from "metabase/urls";
import { DEFAULT_INCLUDE_PERSONAL_COLLECTIONS } from "metabase-enterprise/dependencies/constants";
import type {
  DependencyFilterOptions,
  DependencySortOptions,
} from "metabase-enterprise/dependencies/types";
import {
  getCardTypes,
  getDependencyTypes,
} from "metabase-enterprise/dependencies/utils";
import type {
  CardType,
  DependencyType,
  GetDependencyCountsRequest,
} from "metabase-types/api";

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

type ListFilterParams = {
  types: DependencyType[];
  "card-types": CardType[];
  "include-personal-collections": boolean;
};

export function getListFilterParams({
  groupTypes,
  includePersonalCollections,
}: DependencyFilterOptions): ListFilterParams {
  return {
    types: getDependencyTypes(groupTypes),
    "card-types": getCardTypes(groupTypes),
    "include-personal-collections": includePersonalCollections,
  };
}

/** Counts the Broken and Unreferenced lists as their pages show them by default. */
export function getDependencyCountsRequest(): GetDependencyCountsRequest {
  const broken = getListFilterParams(getDefaultFilterOptions("broken"));
  const unreferenced = getListFilterParams(
    getDefaultFilterOptions("unreferenced"),
  );

  return {
    "breaking-types": broken.types,
    "breaking-card-types": broken["card-types"],
    "breaking-include-personal-collections":
      broken["include-personal-collections"],
    "unreferenced-types": unreferenced.types,
    "unreferenced-card-types": unreferenced["card-types"],
    "unreferenced-include-personal-collections":
      unreferenced["include-personal-collections"],
  };
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
