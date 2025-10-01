import type { DependencyGroup } from "../types";

export function getNodeLabel(group: DependencyGroup) {
  const count = group.nodes.length;

  switch (group.type) {
    case "question":
      return `${count} questions`;
    case "model":
      return `${count} models`;
    case "metric":
      return `${count} metrics`;
    case "table":
      return `${count} tables`;
  }
}
