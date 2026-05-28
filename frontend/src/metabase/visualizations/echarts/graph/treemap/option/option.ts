import type { TreemapSeriesOption } from "echarts/charts";

import { getTreemapColors } from "../model/colors";
import { getTreemapNodeId } from "../model/tooltip";
import type { TreemapNode, TreemapTree } from "../model/types";

export interface TreemapSeriesNode {
  id: string;
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

export function getTreemapChartOption(
  tree: TreemapTree,
  colors: Record<string, string> = getTreemapColors(tree),
): {
  series: TreemapChartSeriesOption;
} {
  const hasChildren = tree.some((node) => node.children != null);

  const series: TreemapChartSeriesOption = {
    type: "treemap",
    nodeClick: "zoomToNode",
    roam: false,
    data: toSeriesData(tree, colors),
    ...(hasChildren ? { levels: TWO_LEVEL_LEVELS } : {}),
  };

  return { series };
}

function toSeriesData(
  tree: TreemapTree,
  colors: Record<string, string>,
): TreemapSeriesNode[] {
  return tree.map((node, rootIndex) => ({
    id: getTreemapNodeId(rootIndex),
    name: node.displayName,
    value: node.value,
    rawName: node.rawName,
    rowIndices: node.rowIndices,
    itemStyle: { color: colors[String(node.rawName)] },
    ...(node.children
      ? {
          children: node.children.map((leaf, leafIndex) => ({
            id: getTreemapNodeId(rootIndex, leafIndex),
            name: leaf.displayName,
            value: leaf.value,
            rawName: leaf.rawName,
            rowIndices: leaf.rowIndices,
          })),
        }
      : {}),
  }));
}
