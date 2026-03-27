import { DEFAULT_INCLUDE_PERSONAL_COLLECTIONS } from "metabase-enterprise/dependencies/constants";
import type {
  DependencyFilterOptions,
  DependencySortOptions,
} from "metabase-enterprise/dependencies/types";
import {
  getCardTypes,
  getDependencyTypes,
} from "metabase-enterprise/dependencies/utils";
import type { CardId, ListNodeDependentsRequest } from "metabase-types/api";

import { DEPENDENTS_GROUP_TYPES } from "./constants";

export function getListRequest(
  cardId: CardId,
  filterOptions: DependencyFilterOptions,
  sortOptions: DependencySortOptions,
): ListNodeDependentsRequest {
  return {
    id: cardId,
    type: "card",
    "dependent-types": getDependencyTypes(filterOptions.groupTypes),
    "dependent-card-types": getCardTypes(filterOptions.groupTypes),
    "include-personal-collections": filterOptions.includePersonalCollections,
    "sort-column": sortOptions.column,
    "sort-direction": sortOptions.direction,
  };
}

export function getDefaultFilterOptions(): DependencyFilterOptions {
  return {
    groupTypes: DEPENDENTS_GROUP_TYPES,
    includePersonalCollections: DEFAULT_INCLUDE_PERSONAL_COLLECTIONS,
  };
}

export function getDefaultSortOptions(): DependencySortOptions {
  return { column: "name", direction: "asc" };
}
