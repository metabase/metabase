import type {
  DependencyFilterOptions,
  DependencyGroupType,
} from "metabase-types/api";

import { DEFAULT_INCLUDE_PERSONAL_COLLECTIONS } from "../../constants";

export function getDefaultFilterOptions(
  availableGroupTypes: DependencyGroupType[],
): DependencyFilterOptions {
  return {
    groupTypes: availableGroupTypes,
    includePersonalCollections: DEFAULT_INCLUDE_PERSONAL_COLLECTIONS,
  };
}

function areGroupTypesEqual(
  groupTypes1: DependencyGroupType[],
  groupTypes2: DependencyGroupType[],
): boolean {
  const groupTypes1Set = new Set(groupTypes1);
  return (
    groupTypes1Set.size === groupTypes2.length &&
    groupTypes2.every((groupType) => groupTypes1Set.has(groupType))
  );
}

export function areFilterOptionsEqual(
  filterOptions1: DependencyFilterOptions,
  filterOptions2: DependencyFilterOptions,
): boolean {
  return (
    areGroupTypesEqual(filterOptions1.groupTypes, filterOptions2.groupTypes) &&
    filterOptions1.includePersonalCollections ===
      filterOptions2.includePersonalCollections
  );
}
