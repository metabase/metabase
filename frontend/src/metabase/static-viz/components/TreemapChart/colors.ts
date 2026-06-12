import Color from "color";

import { getTreemapNodeKey } from "metabase/visualizations/echarts/graph/treemap/model/data";
import type { TreemapTree } from "metabase/visualizations/echarts/graph/treemap/model/types";

const MAX_DARKEN = 0.55;

export function getMonochromeTreemapColors(
  tree: TreemapTree,
  baseColor: string,
): Record<string, string> {
  const byValueDesc = [...tree].sort((a, b) => b.value - a.value);
  const colors: Record<string, string> = {};
  byValueDesc.forEach((node, index) => {
    const rank = byValueDesc.length <= 1 ? 0 : index / (byValueDesc.length - 1);
    colors[getTreemapNodeKey(node)] = Color(baseColor)
      .darken(MAX_DARKEN * rank)
      .hex();
  });
  return colors;
}
