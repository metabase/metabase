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
  _option: FilterOption,
) {
  const type = getDependencyType(groupType);
  return match(type)
    .with("card", () => true)
    .with(P.union("table", "transform", "snippet"), () => false)
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
    const location1 = getNodeLocationInfo(node1);
    const location2 = getNodeLocationInfo(node2);
    const minLength = Math.min(location1.length, location2.length);
    for (let i = 0; i < minLength; i++) {
      const label1 = location1[i].label;
      const label2 = location2[i].label;
      const result = label1.localeCompare(label2);
      if (result !== 0) {
        return result;
      }
    }
    return location1.length < location2.length ? -1 : 1;
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
  const type = getDependencyType(groupType);
  return match(column)
    .with("name", () => true)
    .with("location", () =>
      match(type)
        .with(P.union("card", "table", "transform"), () => true)
        .with("snippet", () => false)
        .exhaustive(),
    )
    .with("view-count", () =>
      match(type)
        .with("card", () => true)
        .with(P.union("table", "transform", "snippet"), () => false)
        .exhaustive(),
    )
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
