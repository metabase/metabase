import type { IconName } from "metabase/ui";
import type { DependencyNode } from "metabase-types/api";

export function getNodeIcon(node: DependencyNode): IconName {
  switch (node.type) {
    case "table":
      return "table";
    case "card":
      return "table2";
  }
}

export function getNodeLabel(node: DependencyNode) {
  switch (node.type) {
    case "table":
      return node.entity.display_name;
    case "card":
      return node.entity.name;
  }
}
