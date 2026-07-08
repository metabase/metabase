import Color from "color";

import { getColorsForValues } from "metabase/ui/colors/charts";
import type { TreemapRow } from "metabase-types/api";

import { getTreemapNodeKey } from "./data";
import type { TreemapTree } from "./types";

const LEAF_LIGHTNESS_MIN = 0.3;
const LEAF_LIGHTNESS_MAX = 0.5;

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

export function getTreemapLeafColor(
  groupColor: string | undefined,
  value: number,
  minValue: number,
  maxValue: number,
): string | undefined {
  if (!groupColor) {
    return undefined;
  }
  const normalized =
    maxValue === minValue ? 0.5 : (value - minValue) / (maxValue - minValue);
  const lightness =
    LEAF_LIGHTNESS_MIN + normalized * (LEAF_LIGHTNESS_MAX - LEAF_LIGHTNESS_MIN);
  return Color(groupColor)
    .lightness(lightness * 100)
    .rgb()
    .string();
}
