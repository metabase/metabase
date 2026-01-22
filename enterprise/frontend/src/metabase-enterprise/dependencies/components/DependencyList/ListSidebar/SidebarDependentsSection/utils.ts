import type {
  DependencyNode,
  ListNodeDependentsRequest,
} from "metabase-types/api";

import type {
  DependencyFilterOptions,
  DependencySortOptions,
} from "../../../../types";
import { getCardTypes, getDependencyTypes } from "../../../../utils";
import { BROKEN_DEPENDENTS_GROUP_TYPES } from "../../constants";

export function getListRequest(
  node: DependencyNode,
  filterOptions: DependencyFilterOptions,
  sortOptions: DependencySortOptions,
): ListNodeDependentsRequest {
  return {
    id: node.id,
    type: node.type,
    dependent_types: getDependencyTypes(
      filterOptions.groupTypes ?? BROKEN_DEPENDENTS_GROUP_TYPES,
    ),
    dependent_card_types: getCardTypes(
      filterOptions.groupTypes ?? BROKEN_DEPENDENTS_GROUP_TYPES,
    ),
    broken: true,
    include_personal_collections:
      filterOptions.includePersonalCollections ?? true,
    sort_column: sortOptions.column,
    sort_direction: sortOptions.direction,
  };
}

export function getDefaultFilterOptions(): DependencyFilterOptions {
  return {};
}

export function getDefaultSortOptions(): DependencySortOptions {
  return { column: "view-count", direction: "desc" };
}
