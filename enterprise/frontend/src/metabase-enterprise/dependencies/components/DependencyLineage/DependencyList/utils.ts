import { P, match } from "ts-pattern";

import type {
  DependencyNode,
  ListNodeDependentsRequest,
} from "metabase-types/api";

import type { GraphSelection } from "../types";
import { getNodeLabel, getNodeLocationLabel, getNodeViewCount } from "../utils";

import type { SearchOptions, SortColumn } from "./types";

export function getListRequest(
  selection: GraphSelection,
): ListNodeDependentsRequest {
  return {
    id: selection.node.id,
    type: selection.node.type,
    dependent_type: match(selection.type)
      .with(P.union("question", "model", "metric"), () => "card" as const)
      .otherwise((type) => type),
    dependent_card_type: match(selection.type)
      .with(P.union("question", "model", "metric"), (type) => type)
      .otherwise(() => undefined),
  };
}

function isMatchingSearchQuery(node: DependencyNode, searchQuery: string) {
  return getNodeLabel(node).toLowerCase().includes(searchQuery);
}

function compareNodes(
  node1: DependencyNode,
  node2: DependencyNode,
  column: SortColumn,
) {
  switch (column) {
    case "name":
      return getNodeLabel(node1).localeCompare(getNodeLabel(node2));
    case "location":
      return (getNodeLocationLabel(node1) ?? "").localeCompare(
        getNodeLocationLabel(node2) ?? "",
      );
    case "view_count":
      return (getNodeViewCount(node1) ?? 0) - (getNodeViewCount(node2) ?? 0);
    default:
      return 0;
  }
}

export function getVisibleNodes(
  nodes: DependencyNode[],
  options: SearchOptions,
) {
  const searchQuery = options.searchQuery.trim().toLowerCase();
  const visibleNodes = nodes.filter((node) =>
    isMatchingSearchQuery(node, searchQuery),
  );
  visibleNodes.sort((node1, node2) => {
    const result = compareNodes(node1, node2, options.sortOptions.column);
    const factor = options.sortOptions.direction === "asc" ? 1 : -1;
    return result * factor;
  });
  return visibleNodes;
}
