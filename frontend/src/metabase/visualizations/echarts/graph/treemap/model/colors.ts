import { getColorsForValues } from "metabase/ui/colors/charts";
import type { TreemapRow } from "metabase-types/api";

import { getTreemapNodeKey } from "./data";
import type { TreemapTree } from "./types";

export function getTreemapColors(
  tree: TreemapTree,
  treemapRows?: TreemapRow[],
): Record<string, string> {
  const colors = getColorsForValues(tree.map(getTreemapNodeKey));
  treemapRows?.forEach((row) => {
    colors[row.key] = row.color;
  });
  return colors;
}
