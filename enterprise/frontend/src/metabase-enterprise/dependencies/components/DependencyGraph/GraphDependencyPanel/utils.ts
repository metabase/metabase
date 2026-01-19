import type {
  DependencyGroupType,
  DependencyNode,
  ListNodeDependentsRequest,
} from "metabase-types/api";

import {
  getCardType,
  getDependencyType,
  getNodeLabel,
  getNodeLocationInfo,
  getNodeViewCount,
} from "../../../utils";

import { FILTER_OPTIONS } from "./constants";
import type {
  FilterCallback,
  FilterOption,
  SearchOptions,
  SortCallback,
  SortColumn,
  SortOptions,
} from "./types";

export function getListRequest(
  node: DependencyNode,
  groupType: DependencyGroupType,
): ListNodeDependentsRequest {
  return {
    id: node.id,
    type: node.type,
    dependent_type: getDependencyType(groupType),
    dependent_card_type: getCardType(groupType) ?? undefined,
  };
}

function isMatchingSearchQuery(
  node: DependencyNode,
  lowerCaseSearchQuery: string,
): boolean {
  return getNodeLabel(node).toLowerCase().includes(lowerCaseSearchQuery);
}

const FILTERS: Record<FilterOption, FilterCallback> = {
  "include-in-personal-collections": (node, isEnabled) => {
    if (isEnabled) {
      return true;
    }
    switch (node.type) {
      case "card":
      case "dashboard":
      case "document": {
        const collection = node.data.collection;
        return collection != null && !collection.is_personal;
      }
      default:
        return false;
    }
  },
};

export function canFilterByOption(
  groupType: DependencyGroupType,
  option: FilterOption,
): boolean {
  const type = getDependencyType(groupType);
  switch (option) {
    case "include-in-personal-collections":
      switch (type) {
        case "card":
        case "dashboard":
        case "document":
          return true;
        default:
          return false;
      }
  }
}

export function canFilter(groupType: DependencyGroupType): boolean {
  return FILTER_OPTIONS.some((option) => canFilterByOption(groupType, option));
}

export function getDefaultFilterOptions(groupType: DependencyGroupType): FilterOption[] {
  return FILTER_OPTIONS.filter((option => canFilterByOption(groupType, option)))
}

function isMatchingFilters(
  node: DependencyNode,
  filterOptions: FilterOption[],
): boolean {
  return FILTER_OPTIONS.every((option) => FILTERS[option](node, filterOptions.includes(option)));
}

const COMPARATORS: Record<SortColumn, SortCallback> = {
  name: (node1, node2) => {
    const label1 = getNodeLabel(node1);
    const label2 = getNodeLabel(node2);
    return label1.localeCompare(label2);
  },
  location: (node1, node2) => {
    const links1 = getNodeLocationInfo(node1)?.links ?? [];
    const links2 = getNodeLocationInfo(node2)?.links ?? [];
    const minLinks = links1.length < links2.length ? links1 : links2;
    const result = minLinks
      .map((_link, i) => links1[i].label.localeCompare(links2[i].label))
      .find((result) => result !== 0);
    return result ?? links1.length - links2.length;
  },
  "view-count": (node1, node2) => {
    const count1 = getNodeViewCount(node1) ?? 0;
    const count2 = getNodeViewCount(node2) ?? 0;
    return count1 - count2;
  },
};

export function canSortByColumn(
  groupType: DependencyGroupType,
  column: SortColumn,
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
    case "view-count":
      switch (groupType) {
        case "question":
        case "dashboard":
        case "document":
          return true;
        default:
          return false;
      }
  }
}

export function getDefaultSortOptions(type: DependencyGroupType): SortOptions {
  if (canSortByColumn(type, "view-count")) {
    return { column: "view-count", direction: "desc" };
  } else {
    return { column: "name", direction: "asc" };
  }
}

function compareNodes(
  node1: DependencyNode,
  node2: DependencyNode,
  { column, direction }: SortOptions,
): number {
  const result = COMPARATORS[column](node1, node2);
  const factor = direction === "asc" ? 1 : -1;
  return result * factor;
}

export function getVisibleNodes(
  nodes: DependencyNode[],
  options: SearchOptions,
): DependencyNode[] {
  const lowerCaseSearchQuery = options.searchQuery.toLowerCase();
  const visibleNodes = nodes.filter(
    (node) =>
      isMatchingSearchQuery(node, lowerCaseSearchQuery) &&
      isMatchingFilters(node, options.filterOptions),
  );
  visibleNodes.sort((node1, node2) =>
    compareNodes(node1, node2, options.sortOptions),
  );
  return visibleNodes;
}
