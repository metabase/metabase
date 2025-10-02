import { msgid, ngettext } from "ttag";

import type { IconName } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import type { NodeGroup, NodeType } from "./types";

export function getNodeIcon(node: DependencyNode): IconName {
  switch (node.type) {
    case "card":
      switch (node.data.type) {
        case "question":
          return "table2";
        case "model":
          return "model";
        case "metric":
          return "metric";
      }
      break;
    case "table":
      return "table";
    case "snippet":
      return "snippet";
    case "transform":
      return "refresh_downstream";
  }
}

export function getNodeLabel(node: DependencyNode) {
  switch (node.type) {
    case "card":
    case "snippet":
    case "transform":
      return node.data.name;
    case "table":
      return node.data.display_name;
  }
}

function getNodeType(node: DependencyNode): NodeType {
  return node.type === "card" ? node.data.type : node.type;
}

export function getNodeGroups(nodes: DependencyNode[]): NodeGroup[] {
  const countByType = new Map<NodeType, number>();
  nodes.forEach((node) => {
    const type = getNodeType(node);
    const count = countByType.get(type) ?? 0;
    countByType.set(type, count + 1);
  });

  const groups: NodeGroup[] = [];
  countByType.forEach((count, type) => groups.push({ type, count }));
  return groups;
}

export function getNodeGroupLabel({ type, count }: NodeGroup) {
  switch (type) {
    case "question":
      return ngettext(msgid`question use this`, `questions use this`, count);
    case "model":
      return ngettext(msgid`model use this`, `models use this`, count);
    case "metric":
      return ngettext(msgid`metric use this`, `metrics use this`, count);
    case "table":
      return ngettext(msgid`table use this`, `tables use this`, count);
    case "snippet":
      return ngettext(msgid`snippet use this`, `snippets use this`, count);
    case "transform":
      return ngettext(msgid`transform use this`, `transforms use this`, count);
  }
}
