import type { IconName } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

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
