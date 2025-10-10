import { match } from "ts-pattern";

import type {
  DependencyGroupType,
  DependencyNode,
  ListNodeDependentsRequest,
} from "metabase-types/api";

import type { GraphSelection } from "../types";
import {
  getCardType,
  getDependencyType,
  getNodeLabel,
  getNodeLocationLabel,
  getNodeViewCount,
  isCardType,
} from "../utils";

import { FILTER_OPTIONS } from "./constants";
import type {
  FilterOption,
  NodeComparator,
  NodeFilter,
  SearchOptions,
  SortColumn,
  SortOptions,
} from "./types";

export function getListRequest(
  selection: GraphSelection,
): ListNodeDependentsRequest {
  return {
    id: selection.node.id,
    type: selection.node.type,
    dependent_type: getDependencyType(selection.groupType),
    dependent_card_type: getCardType(selection.groupType),
  };
}

function isMatchingSearchQuery(node: DependencyNode, searchQuery: string) {
  return getNodeLabel(node).toLowerCase().includes(searchQuery);
}

const FILTERS: Record<FilterOption, NodeFilter> = {
  verified: (node) => {
    if (node.type === "card") {
      const lastReview = node.data.moderation_reviews?.find(
        (review) => review.most_recent,
      );
      return lastReview != null && lastReview.status === "verified";
    }
    return false;
  },
  "in-dashboard": (node) => {
    if (node.type === "card") {
      const dashboard = node.data.dashboard;
      return dashboard != null;
    }
    return false;
  },
  "in-official-collection": (node) => {
    if (node.type === "card") {
      const collection = node.data.collection;
      return collection != null && collection.authority_level === "official";
    }
    return false;
  },
  "not-in-personal-collection": (node) => {
    if (node.type === "card") {
      const collection = node.data.collection;
      return collection != null && !collection.is_personal;
    }
    return false;
  },
};

export function canFilterByOption(
  groupType: DependencyGroupType,
  option: FilterOption,
) {
  return match(option)
    .with("verified", () => isCardType(groupType))
    .with("in-dashboard", () => isCardType(groupType))
    .with("in-official-collection", () => isCardType(groupType))
    .with("not-in-personal-collection", () => isCardType(groupType))
    .exhaustive();
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

  return filterOptions.some((option) => FILTERS[option](node));
}

const COMPARATORS: Record<SortColumn, NodeComparator> = {
  name: (node1, node2) => {
    const label1 = getNodeLabel(node1);
    const label2 = getNodeLabel(node2);
    return label1.localeCompare(label2);
  },
  location: (node1, node2) => {
    const label1 = getNodeLocationLabel(node1) ?? "";
    const label2 = getNodeLocationLabel(node2) ?? "";
    return label1.localeCompare(label2);
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
) {
  return match(column)
    .with("name", () => true)
    .with("location", () => isCardType(groupType))
    .with("view-count", () => isCardType(groupType))
    .exhaustive();
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
  const searchQuery = options.searchQuery.trim().toLowerCase();
  const visibleNodes = nodes.filter(
    (node) =>
      isMatchingSearchQuery(node, searchQuery) &&
      isMatchingFilters(node, options.filterOptions),
  );
  visibleNodes.sort((node1, node2) =>
    compareNodes(node1, node2, options.sortOptions),
  );
  return visibleNodes;
}
