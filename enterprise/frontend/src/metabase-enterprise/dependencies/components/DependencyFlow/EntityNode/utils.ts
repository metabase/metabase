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

export function getNodeGroups(
  node: DependencyNode,
  targets: DependencyNode[],
): NodeGroup[] {
  if (node.type === "transform") {
    return [];
  }

  const countByType = new Map<NodeType, number>();
  targets.forEach((node) => {
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
      return ngettext(msgid`question uses this`, `questions use this`, count);
    case "model":
      return ngettext(msgid`model uses this`, `models use this`, count);
    case "metric":
      return ngettext(msgid`metric uses this`, `metrics use this`, count);
    case "table":
      return ngettext(msgid`table uses this`, `tables use this`, count);
    case "snippet":
      return ngettext(msgid`snippet uses this`, `snippets use this`, count);
    case "transform":
      return ngettext(msgid`transform uses this`, `transforms use this`, count);
  }
}
