import type { TreemapSeriesOption } from "echarts/charts";
import type { EChartsCoreOption } from "echarts/core";

import type { TreemapNode, TreemapTree } from "../model/types";

interface TreemapSeriesNode {
  name: string;
  value: number;
  rawName: TreemapNode["rawName"];
  rowIndices: number[];
  children?: TreemapSeriesNode[];
}

export function getTreemapChartOption(tree: TreemapTree): EChartsCoreOption {
  const series: TreemapSeriesOption = {
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
