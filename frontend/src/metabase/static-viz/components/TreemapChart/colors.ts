import Color from "color";

import type { TreemapTree } from "metabase/visualizations/echarts/graph/treemap/model/types";

/**
 * How much the smallest tile is darkened relative to the base color. The
 * in-between tiles interpolate linearly by value rank.
 */
const MAX_DARKEN = 0.55;

/**
 * Single-hue color ramp for a 1-level static treemap, per the Figma
 * static-export spec: the largest tile keeps the base (brand) color and
 * progressively smaller tiles get progressively darker shades of it. Keyed by
 * the node's raw name, like `getTreemapColors`.
 */
export function getMonochromeTreemapColors(
  tree: TreemapTree,
  baseColor: string,
): Record<string, string> {
  const byValueDesc = [...tree].sort((a, b) => b.value - a.value);
  const colors: Record<string, string> = {};
  byValueDesc.forEach((node, index) => {
    const rank = byValueDesc.length <= 1 ? 0 : index / (byValueDesc.length - 1);
    colors[String(node.rawName)] = Color(baseColor)
      .darken(MAX_DARKEN * rank)
      .hex();
  });
  return colors;
}
