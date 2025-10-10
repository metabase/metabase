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
} from "../utils";

import type { SearchOptions, SortColumn, SortOptions } from "./types";

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

export function canSortByColumn(
  groupType: DependencyGroupType,
  column: SortColumn,
) {
  return match(column)
    .with("name", () => true)
    .with("location", () => getCardType(groupType) != null)
    .with("view_count", () => getCardType(groupType) != null)
    .exhaustive();
}

export function getDefaultSortOptions(type: DependencyGroupType): SortOptions {
  if (canSortByColumn(type, "view_count")) {
    return { column: "view_count", direction: "desc" };
  } else {
    return { column: "name", direction: "asc" };
  }
}

function isMatchingSearchQuery(node: DependencyNode, searchQuery: string) {
  return getNodeLabel(node).toLowerCase().includes(searchQuery);
}

function compareNodesByColumn(
  node1: DependencyNode,
  node2: DependencyNode,
  column: SortColumn,
) {
  return match(column)
    .with("name", () => {
      const label1 = getNodeLabel(node1);
      const label2 = getNodeLabel(node2);
      return label1.localeCompare(label2);
    })
    .with("location", () => {
      const label1 = getNodeLocationLabel(node1) ?? "";
      const label2 = getNodeLocationLabel(node2) ?? "";
      return label1.localeCompare(label2);
    })
    .with("view_count", () => {
      const count1 = getNodeViewCount(node1) ?? 0;
      const count2 = getNodeViewCount(node2) ?? 0;
      return count1 - count2;
    })
    .exhaustive();
}

function compareNodes(
  node1: DependencyNode,
  node2: DependencyNode,
  { column, direction }: SortOptions,
) {
  const result = compareNodesByColumn(node1, node2, column);
  const factor = direction === "asc" ? 1 : -1;
  return result * factor;
}

export function getVisibleNodes(
  nodes: DependencyNode[],
  options: SearchOptions,
) {
  const searchQuery = options.searchQuery.trim().toLowerCase();
  const visibleNodes = nodes.filter((node) =>
    isMatchingSearchQuery(node, searchQuery),
  );
  visibleNodes.sort((node1, node2) =>
    compareNodes(node1, node2, options.sortOptions),
  );
  return visibleNodes;
}
