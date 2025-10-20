import { P, match } from "ts-pattern";

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
  isCardGroupType,
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

function isMatchingSearchQuery(node: DependencyNode, searchQuery: string) {
  return getNodeLabel(node).toLowerCase().includes(searchQuery);
}

const FILTERS: Record<FilterOption, FilterCallback> = {
  verified: (node) =>
    match(node)
      .with({ type: "card" }, (node) => {
        const lastReview = node.data.moderation_reviews?.find(
          (review) => review.most_recent,
        );
        return lastReview != null && lastReview.status === "verified";
      })
      .with({ type: P.union("table", "transform", "snippet") }, () => false)
      .exhaustive(),
  "in-dashboard": (node) =>
    match(node)
      .with({ type: "card" }, (node) => {
        const dashboard = node.data.dashboard;
        return dashboard != null;
      })
      .with({ type: P.union("table", "transform", "snippet") }, () => false)
      .exhaustive(),
  "in-official-collection": (node) =>
    match(node)
      .with({ type: "card" }, (node) => {
        const collection = node.data.collection;
        return collection != null && collection.authority_level === "official";
      })
      .with({ type: P.union("table", "transform", "snippet") }, () => false)
      .exhaustive(),
  "not-in-personal-collection": (node) =>
    match(node)
      .with({ type: "card" }, (node) => {
        const collection = node.data.collection;
        return collection != null && !collection.is_personal;
      })
      .with({ type: P.union("table", "transform", "snippet") }, () => false)
      .exhaustive(),
};

export function canFilterByOption(
  groupType: DependencyGroupType,
  option: FilterOption,
) {
  return match({ groupType, option })
    .with({ groupType: P.union("question", "model", "metric") }, () => true)
    .with({ groupType: P.union("table", "transform", "snippet") }, () => false)
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

  return filterOptions.every((option) => FILTERS[option](node));
}

const COMPARATORS: Record<SortColumn, SortCallback> = {
  name: (node1, node2) => {
    const label1 = getNodeLabel(node1);
    const label2 = getNodeLabel(node2);
    return label1.localeCompare(label2);
  },
  location: (node1, node2) => {
    const label1 = getNodeLocationInfo(node1)?.label ?? "";
    const label2 = getNodeLocationInfo(node2)?.label ?? "";
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
    .with("location", () => isCardGroupType(groupType))
    .with("view-count", () => isCardGroupType(groupType))
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
