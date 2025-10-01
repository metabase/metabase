import type { IconName } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

export function getNodeIcon(node: DependencyNode): IconName {
  switch (node.type) {
    case "table":
      return "table";
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
