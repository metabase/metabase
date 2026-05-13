import type { IntrospectorReason } from "../types";

/**
 * Mantine color name for a reason's flag. Mirrors the palette in
 * `ConditionBadges` so the per-flag color is consistent across:
 *
 *   • the Status column badges (broken / stale / unreferenced)
 *   • the Reasons column code prefix in both ContentTable and TransformsTable
 */
export function reasonFlagColor(
  flag: IntrospectorReason["flag"],
): "error" | "warning" | "brand" {
  switch (flag) {
    case "broken":
      return "error";
    case "stale":
      return "warning";
    case "unreferenced":
      return "brand";
  }
}
