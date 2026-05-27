import type { TreemapSeriesOption } from "echarts/charts";

import type { TreemapNode, TreemapTree } from "../model/types";

export interface TreemapSeriesNode {
  name: string;
  value: number;
  rawName: TreemapNode["rawName"];
  rowIndices: number[];
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
  },
];

export function getTreemapChartOption(tree: TreemapTree): {
  series: TreemapChartSeriesOption;
} {
  const hasChildren = tree.some((node) => node.children != null);

  const series: TreemapChartSeriesOption = {
    type: "treemap",
    data: toSeriesData(tree),
    ...(hasChildren ? { levels: TWO_LEVEL_LEVELS } : {}),
  };

  return { series };
}

function toSeriesData(nodes: TreemapTree): TreemapSeriesNode[] {
  return nodes.map((node) => ({
    name: node.displayName,
    value: node.value,
    rawName: node.rawName,
    rowIndices: node.rowIndices,
    ...(node.children ? { children: toSeriesData(node.children) } : {}),
  }));
}
