import type { TreemapSeriesOption } from "echarts/charts";

import { getTreemapColors } from "../model/colors";
import type { TreemapNode, TreemapTree } from "../model/types";

export interface TreemapSeriesNode {
  name: string;
  value: number;
  rawName: TreemapNode["rawName"];
  rowIndices: number[];
  itemStyle?: { color?: string };
  children?: TreemapSeriesNode[];
}

type TreemapChartSeriesOption = TreemapSeriesOption & {
  type: "treemap";
  data: TreemapSeriesNode[];
};

const TWO_LEVEL_LEVELS: TreemapSeriesOption["levels"] = [
  {
    itemStyle: { borderWidth: 0, gapWidth: 2 },
  },
  {
    itemStyle: { borderWidth: 1, gapWidth: 1 },
    colorSaturation: [0.3, 0.5],
  },
];

export function getTreemapChartOption(tree: TreemapTree): {
  series: TreemapChartSeriesOption;
} {
  const hasChildren = tree.some((node) => node.children != null);
  const colors = getTreemapColors(tree);

  const series: TreemapChartSeriesOption = {
    type: "treemap",
    data: toSeriesData(tree, colors),
    ...(hasChildren ? { levels: TWO_LEVEL_LEVELS } : {}),
  };

  return { series };
}

function toSeriesData(
  nodes: TreemapTree,
  colors?: Record<string, string>,
): TreemapSeriesNode[] {
  return nodes.map((node) => ({
    name: node.displayName,
    value: node.value,
    rawName: node.rawName,
    rowIndices: node.rowIndices,
    ...(colors ? { itemStyle: { color: colors[String(node.rawName)] } } : {}),
    ...(node.children ? { children: toSeriesData(node.children) } : {}),
  }));
}
