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
} from "../utils";

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
) {
  return getNodeLabel(node).toLowerCase().includes(lowerCaseSearchQuery);
}

const FILTERS: Record<FilterOption, FilterCallback> = {
  verified: (node) => {
    if (node.type !== "card") {
      return false;
    }
    const lastReview = node.data.moderation_reviews?.find(
      (review) => review.most_recent,
    );
    return lastReview != null && lastReview.status === "verified";
  },
  "in-dashboard": (node) => {
    if (node.type !== "card") {
      return false;
    }
    const dashboard = node.data.dashboard;
    return dashboard != null;
  },
  "in-official-collection": (node) => {
    if (node.type !== "card") {
      return false;
    }
    const collection = node.data.collection;
    return collection != null && collection.authority_level === "official";
  },
  "not-in-personal-collection": (node) => {
    if (node.type !== "card") {
      return false;
    }
    const collection = node.data.collection;
    return collection != null && !collection.is_personal;
  },
};

export function canFilterByOption(
  groupType: DependencyGroupType,
  option: FilterOption,
): boolean {
  const type = getDependencyType(groupType);
  switch (option) {
    case "verified":
    case "in-dashboard":
    case "in-official-collection":
    case "not-in-personal-collection":
      return type === "card";
  }
}

export function canFilter(groupType: DependencyGroupType) {
  return FILTER_OPTIONS.some((option) => canFilterByOption(groupType, option));
}

function isMatchingFilters(
  node: DependencyNode,
  filterOptions: FilterOption[],
) {
  if (filterOptions.length === 0) {
    return true;
  }

  return filterOptions.every((option) => FILTERS[option](node));
}

const COMPARATORS: Record<SortColumn, SortCallback> = {
  name: (node1, node2) => {
    const label1 = getNodeLabel(node1);
    const label2 = getNodeLabel(node2);
    return label1.localeCompare(label2);
  },
  location: (node1, node2) => {
    const parts1 = getNodeLocationInfo(node1)?.parts ?? [];
    const parts2 = getNodeLocationInfo(node2)?.parts ?? [];
    const minParts = parts1.length < parts2.length ? parts1 : parts2;
    const result = minParts
      .map((_link, i) => parts1[i].label.localeCompare(parts2[i].label))
      .find((result) => result !== 0);
    return result ?? parts1.length - parts2.length;
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
  const type = getDependencyType(groupType);
  switch (column) {
    case "name":
      return true;
    case "location":
    case "view-count":
      return type === "card";
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
) {
  const result = COMPARATORS[column](node1, node2);
  const factor = direction === "asc" ? 1 : -1;
  return result * factor;
}

export function getVisibleNodes(
  nodes: DependencyNode[],
  options: SearchOptions,
) {
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
