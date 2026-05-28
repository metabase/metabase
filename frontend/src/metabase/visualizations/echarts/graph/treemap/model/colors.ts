import { getColorsForValues } from "metabase/ui/colors/charts";

import type { TreemapTree } from "./types";

export function getTreemapColors(tree: TreemapTree): Record<string, string> {
  return getColorsForValues(tree.map((node) => String(node.rawName)));
}
