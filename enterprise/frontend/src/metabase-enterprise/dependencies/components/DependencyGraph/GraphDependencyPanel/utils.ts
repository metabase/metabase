import {
  DEPENDENCY_SORT_COLUMNS,
  type DependencyGroupType,
  type DependencyNode,
  type DependencySortColumn,
  type ListNodeDependentsRequest,
} from "metabase-types/api";

import type {
  DependencyFilterOptions,
  DependencySortOptions,
} from "../../../types";
import { getCardType, getDependencyType } from "../../../utils";

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
    dependent_types: [type],
    dependent_card_types: cardType != null ? [cardType] : undefined,
    query: query,
    include_personal_collections:
      filterOptions.includePersonalCollections ?? true,
    sort_column: sortOptions.column,
    sort_direction: sortOptions.direction,
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
  return {};
}

export function canSortByColumn(
  groupType: DependencyGroupType,
  column: DependencySortColumn,
): boolean {
  switch (column) {
    case "name":
      return true;
    case "location":
      switch (groupType) {
        case "question":
        case "model":
        case "metric":
        case "dashboard":
        case "document":
          return true;
        default:
          return false;
      }
    default:
      return false;
  }
}

export function getAvailableSortColumns(
  groupType: DependencyGroupType,
): DependencySortColumn[] {
  return DEPENDENCY_SORT_COLUMNS.filter((column) =>
    canSortByColumn(groupType, column),
  );
}

export function getDefaultSortOptions(): DependencySortOptions {
  return { column: "name", direction: "asc" };
}
