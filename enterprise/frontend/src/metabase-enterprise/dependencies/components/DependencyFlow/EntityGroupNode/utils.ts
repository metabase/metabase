import type { DependencyGroup } from "../types";

export function getNodeLabel(group: DependencyGroup) {
  return `${group.nodes.length} entities`;
}
