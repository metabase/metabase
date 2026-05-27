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

export function getTreemapChartOption(tree: TreemapTree): {
  series: TreemapChartSeriesOption;
} {
  const series: TreemapChartSeriesOption = {
    type: "treemap",
    data: toSeriesData(tree),
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
