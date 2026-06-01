import Color from "color";
import type { TreemapSeriesOption } from "echarts/charts";

import type { RenderingContext } from "metabase/visualizations/types";

import { TREEMAP_CHART_STYLE } from "../constants";
import { getTreemapColors } from "../model/colors";
import { getTreemapNodeId } from "../model/tooltip";
import type { TreemapNode, TreemapTree } from "../model/types";

// Opacity of the group-header background (the group's hue, translucent).
const GROUP_HEADER_BG_OPACITY = 0.85;

// Bottom inset (px) reserved for the breadcrumb overlay while drilled in.
const DRILLED_BOTTOM_INSET = 48;

export interface TreemapSeriesNode {
  id: string;
  name: string;
  value: number;
  rawName: TreemapNode["rawName"];
  rowIndices: number[];
  itemStyle?: { color?: string };
  upperLabel?: { backgroundColor?: string };
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

export function getTreemapChartOption({
  tree,
  colors = getTreemapColors(tree),
  isDrilled = false,
  renderingContext,
}: {
  tree: TreemapTree;
  colors?: Record<string, string>;
  isDrilled?: boolean;
  renderingContext: RenderingContext;
}): {
  series: TreemapChartSeriesOption;
} {
  const hasChildren = tree.some((node) => node.children != null);
  // When drilled into a group it becomes the view root and the breadcrumb shows
  // its name, so we hide the group header and reserve bottom space for the pill.
  const bottomSpace = isDrilled ? DRILLED_BOTTOM_INSET : 0;

  // Header band labelling each top-level group at the overview. `upperLabel`
  // renders on nodes shown *with* their children (the groupings in the 2-level
  // view); leaves keep their normal `label`. No-op for 1-level treemaps (no
  // parent nodes). Reused for the emphasis (hover) state so the label doesn't
  // shift — ECharts' default `emphasis.upperLabel` drops our position/padding.
  const upperLabel: TreemapChartSeriesOption["upperLabel"] = {
    show: !isDrilled,
    height: 32,
    position: [0, 12],
    color: renderingContext.getColor("text-primary"),
    fontSize: 12,
    fontWeight: 700,
    // Chip shape; the per-node `backgroundColor` (the group hue with opacity)
    // is set in `toSeriesData`.
    padding: [0, 12],
    // borderRadius: 4,
  };

  const series: TreemapChartSeriesOption = {
    type: "treemap",
    // Native click is disabled; TreemapChart hijacks `click` to drill into the
    // clicked node's grouping (see TreemapChart/events.ts). `leafDepth: 2` keeps
    // the initial view at two levels.
    nodeClick: false,
    roam: false,
    // A custom React breadcrumb (see TreemapChart) replaces ECharts' native one.
    breadcrumb: { show: false },
    label: {
      ...TREEMAP_CHART_STYLE.nodeLabels,
    },
    upperLabel,
    // Mirror the normal upperLabel on hover so the group header doesn't shift
    // (ECharts' default `emphasis.upperLabel` resets position/padding).
    emphasis: { upperLabel },
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
  return tree.map((node, rootIndex) => {
    const groupColor = colors[String(node.rawName)];
    return {
      id: getTreemapNodeId(rootIndex),
      name: node.displayName,
      value: node.value,
      rawName: node.rawName,
      rowIndices: node.rowIndices,
      itemStyle: { color: groupColor },
      ...(groupColor
        ? {
            upperLabel: {
              backgroundColor: Color(groupColor)
                .alpha(GROUP_HEADER_BG_OPACITY)
                .string(),
            },
          }
        : {}),
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
    };
  });
}
