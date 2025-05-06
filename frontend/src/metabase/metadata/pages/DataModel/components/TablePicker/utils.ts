import type { IconName } from "metabase/ui";

export function getIconForType(
  type: "database" | "schema" | "table",
): IconName {
  if (type === "table") {
    return "table2";
  }
  return type;
}

export function hasChildren(type: "database" | "schema" | "table"): boolean {
  return type !== "table";
}
