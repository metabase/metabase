import type { AdvancedTransformType } from "metabase-types/api";

export function getTypeLabel(type: AdvancedTransformType) {
  const map: Record<AdvancedTransformType, string> = {
    python: "Python",
    javascript: "JavaScript",
  };

  return map[type];
}
