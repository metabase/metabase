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
  bottomSpace = 0,
): {
  series: TreemapChartSeriesOption;
} {
  const hasChildren = tree.some((node) => node.children != null);

  const series: TreemapChartSeriesOption = {
    type: "treemap",
    // Native click is disabled; TreemapChart hijacks `click` to drill into the
    // clicked node's grouping (see TreemapChart/events.ts). `leafDepth: 2` keeps
    // the initial view at two levels.
    nodeClick: false,
    roam: false,
    // A custom React breadcrumb (see TreemapChart) replaces ECharts' native one.
    breadcrumb: { show: false },
    // Full-bleed layout. ECharts' default reserves `top`/`bottom: 50px` (where
    // the native breadcrumb sat) — we zero it out so the overview fills the
    // whole area, and reserve `bottomSpace` only while drilled in, so the
    // breadcrumb overlay has room without overlapping tiles. The bottom inset
    // changes via a fresh `setOption` (not a canvas resize), so there's no
    // resize/animation race to corrupt the layout.
    top: 0,
    left: 0,
    right: 0,
    bottom: bottomSpace,
    data: toSeriesData(tree, colors),
    leafDepth: 2,
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
