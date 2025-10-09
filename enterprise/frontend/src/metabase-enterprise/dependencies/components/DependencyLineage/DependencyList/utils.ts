import { P, match } from "ts-pattern";

import type {
  DependencyNode,
  ListNodeDependentsRequest,
} from "metabase-types/api";

import type { GraphSelection } from "../types";
import { getNodeLabel } from "../utils";

export function getRequest(
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

export function getMatchingNodes(nodes: DependencyNode[], searchText: string) {
  const searchTextLowerCase = searchText.toLowerCase();
  return nodes.filter((node) =>
    getNodeLabel(node).toLowerCase().includes(searchTextLowerCase),
  );
}

export function getNodeViewCount(node: DependencyNode): number | undefined {
  return match(node)
    .with({ type: "card" }, (node) => node.data.view_count)
    .otherwise(() => undefined);
}
