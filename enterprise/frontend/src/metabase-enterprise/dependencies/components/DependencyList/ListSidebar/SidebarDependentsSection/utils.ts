import type {
  DependencyNode,
  ListNodeDependentsRequest,
} from "metabase-types/api";

import type {
  DependencyFilterOptions,
  DependencySortOptions,
} from "../../../../types";

export function getListRequest(
  node: DependencyNode,
  filterOptions: DependencyFilterOptions,
  sortOptions: DependencySortOptions,
): ListNodeDependentsRequest {
  return {
    id: node.id,
    type: node.type,
    broken: true,
    include_personal_collections: filterOptions.includePersonalCollections,
    sort_column: sortOptions.column,
    sort_direction: sortOptions.direction,
  };
}

export function getDefaultFilterOptions(): DependencyFilterOptions {
  return { includePersonalCollections: true };
}

export function getDefaultSortOptions(): DependencySortOptions {
  return { column: "view-count", direction: "desc" };
}
