import { t } from "ttag";

import type { HierarchyKind } from "./hierarchies";

/**
 * What an admin picks: levels of columns, or rows that point to a parent row.
 * Fixed and ragged are both "levels"; which one is how gaps are handled.
 */
export type HierarchyType = "levels" | "parent";

export const HIERARCHY_TYPES: HierarchyType[] = ["levels", "parent"];

export const getHierarchyType = (kind: HierarchyKind): HierarchyType =>
  kind === "recursive" ? "parent" : "levels";

export function getHierarchyTypeLabel(type: HierarchyType): string {
  switch (type) {
    case "levels":
      return t`Levels`;
    case "parent":
      return t`Parent and child`;
  }
}

/** What a type means, in a phrase, with an example */
export function getHierarchyTypeDescription(type: HierarchyType): string {
  switch (type) {
    case "levels":
      return t`Columns nest, like Country › State › City.`;
    case "parent":
      return t`Rows point to a parent row, like employees to their managers.`;
  }
}
