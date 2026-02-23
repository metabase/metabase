import type {
  DependencyGroupType,
  DependencyNode,
  DependencySortColumn,
  ListNodeDependentsRequest,
} from "metabase-types/api";

import { DEFAULT_INCLUDE_PERSONAL_COLLECTIONS } from "../../../constants";
import type {
  DependencyFilterOptions,
  DependencySortOptions,
} from "../../../types";
import {
  canNodeHaveViewCount,
  getCardType,
  getDependencyType,
} from "../../../utils";

export function getListRequest(
  node: DependencyNode,
  groupType: DependencyGroupType,
  query: string | undefined,
  filterOptions: DependencyFilterOptions,
  sortOptions: DependencySortOptions,
): ListNodeDependentsRequest {
  const type = getDependencyType(groupType);
  const cardType = getCardType(groupType);

  return {
    id: node.id,
    type: node.type,
    "dependent-types": [type],
    "dependent-card-types": cardType != null ? [cardType] : undefined,
    query: query,
    "include-personal-collections": filterOptions.includePersonalCollections,
    "sort-column": sortOptions.column,
    "sort-direction": sortOptions.direction,
  };
}

export function canFilter(groupType: DependencyGroupType): boolean {
  const type = getDependencyType(groupType);
  switch (type) {
    case "card":
    case "dashboard":
    case "document":
      return true;
    default:
      return false;
  }
}

export function getDefaultFilterOptions(): DependencyFilterOptions {
  return {
    groupTypes: [],
    includePersonalCollections: DEFAULT_INCLUDE_PERSONAL_COLLECTIONS,
  };
}

export function getAvailableSortColumns(
  groupType: DependencyGroupType,
): DependencySortColumn[] {
  return [
    "name",
    "location",
    ...(canNodeHaveViewCount(getDependencyType(groupType))
      ? ["view-count" as const]
      : []),
  ];
}

export function getDefaultSortOptions(
  groupType: DependencyGroupType,
): DependencySortOptions {
  return canNodeHaveViewCount(getDependencyType(groupType))
    ? { column: "view-count", direction: "desc" }
    : { column: "name", direction: "asc" };
}
