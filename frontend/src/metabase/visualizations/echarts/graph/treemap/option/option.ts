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
// Exported so the rounded-corner clip in TreemapChart can match it (otherwise
// the clip rounds the empty breadcrumb strip instead of the drilled tiles).
export const DRILLED_BOTTOM_INSET = 48;

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

  // Header band labelling each top-level group at the overview. ECharts wraps
  // `series.data` in a synthetic root, so depths are: root=0 (`levels[0]`),
  // groups=1 (`levels[1]`), leaves=2. The header therefore goes on `levels[1]`
  // (the groups) — NOT the series or `levels[0]`, which target the synthetic
  // root. A root with `upperLabel.show: true` reserves its `upperLabel.height`
  // as an empty strip across the top of the whole treemap (see
  // `getUpperLabelHeight` in treemapLayout), so we keep the root's header off,
  // letting the group headers start at y=0 so the rounded top corners land on
  // them. Reused for the emphasis (hover) state so the label doesn't shift —
  // ECharts' default `emphasis.upperLabel` drops our padding.
  const groupUpperLabel: NonNullable<TreemapChartSeriesOption["upperLabel"]> = {
    show: !isDrilled,
    height: 32,
    color: renderingContext.getColor("text-primary"),
    fontSize: 12,
    fontWeight: 700,
    // Chip shape; the per-node `backgroundColor` (the group hue with opacity)
    // is set in `toSeriesData`.
    padding: [0, 12],
  };

  const levels: TreemapSeriesOption["levels"] = [
    // levels[0] → synthetic root. Keep its header off so it reserves no top
    // strip; its `gapWidth` spaces the top-level groups apart.
    {
      itemStyle: { borderWidth: 0, gapWidth: 2 },
      upperLabel: { show: false },
    },
    // levels[1] → the groups. The header band lives here.
    {
      itemStyle: { borderWidth: 1, gapWidth: 1 },
      colorSaturation: [0.3, 0.5],
      upperLabel: groupUpperLabel,
      emphasis: { upperLabel: groupUpperLabel },
    },
  ];

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
    // Base for the synthetic root: no upper-label height, or it insets the whole
    // treemap from the top. Group headers come from `levels[1]` instead.
    upperLabel: { show: false },
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
    ...(hasChildren ? { levels } : {}),
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
