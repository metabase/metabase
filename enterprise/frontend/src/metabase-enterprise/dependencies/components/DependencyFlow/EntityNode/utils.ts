import type { IconName } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

export function getNodeIcon(node: DependencyNode): IconName {
  switch (node.type) {
    case "database":
      return "database";
    case "table":
      return "table";
    case "card":
      return "table2";
  }
}

export function getNodeLabel(node: DependencyNode) {
  switch (node.type) {
    case "database":
    case "card":
      return node.data.name;
    case "table":
      return node.data.display_name;
  }
}
