import { msgid, ngettext } from "ttag";

import type { IconName } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

import type { NodeGroup } from "./types";

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
        default:
          return "unknown";
      }
    case "table":
      return "table";
    case "snippet":
      return "sql";
    case "transform":
      return "refresh_downstream";
    default:
      return "unknown";
  }
}

export function getNodeGroups({
  type,
  usage_stats = {},
}: DependencyNode): NodeGroup[] {
  if (type === "transform") {
    return [];
  }

  const {
    questions = 0,
    models = 0,
    metrics = 0,
    transforms = 0,
    snippets = 0,
  } = usage_stats;

  const groups: NodeGroup[] = [];
  groups.push({ type: "question", count: questions });
  groups.push({ type: "model", count: models });
  groups.push({ type: "metric", count: metrics });
  groups.push({ type: "transform", count: transforms });
  groups.push({ type: "snippet", count: snippets });
  return groups.filter((group) => group.count > 0);
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
