import type {
  DependencyNode,
  ListBrokenGraphNodesRequest,
} from "metabase-types/api";

import { DEFAULT_INCLUDE_PERSONAL_COLLECTIONS } from "../../../../constants";
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
): ListBrokenGraphNodesRequest {
  return {
    id: node.id,
    type: node.type,
    dependent_types: getDependencyTypes(filterOptions.groupTypes),
    dependent_card_types: getCardTypes(filterOptions.groupTypes),
    include_personal_collections: filterOptions.includePersonalCollections,
    sort_column: sortOptions.column,
    sort_direction: sortOptions.direction,
  };
}

export function getDefaultFilterOptions(): DependencyFilterOptions {
  return {
    groupTypes: BROKEN_DEPENDENTS_GROUP_TYPES,
    includePersonalCollections: DEFAULT_INCLUDE_PERSONAL_COLLECTIONS,
  };
}

export function getDefaultSortOptions(): DependencySortOptions {
  return { column: "view-count", direction: "desc" };
}
