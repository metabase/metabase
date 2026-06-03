import Color from "color";
import type { TreemapSeriesOption } from "echarts/charts";

import type { RenderingContext } from "metabase/visualizations/types";

import { TREEMAP_CHART_STYLE } from "../constants";
import { getTreemapColors } from "../model/colors";
import type { TreemapLabelLayout } from "../model/labels";
import { getTreemapNodeId } from "../model/tooltip";
import type { TreemapNode, TreemapTree } from "../model/types";

// How much of the group's hue remains in its header chip background (the rest
// is mixed toward white). The chip sits on the group's own opaque background
// fill — the borderColor that tints the within-group gaps — so a translucent
// color would be invisible (hue over the same hue). We paint an opaque blend
// instead, which reads as a translucent band. Lower = paler/more see-through.
const GROUP_HEADER_BG_TINT = 0.4;

// Hide a tile's label once it occupies less than this fraction of the chart
// area. A treemap tile's area is proportional to its value, so a node's share
// of the total is a reliable proxy for its rendered box size — below this,
// the label can't be drawn legibly and ECharts would only truncate it to an
// ellipsis. Applies to tiles that render their own label (leaves in a 2-level
// tree, top-level nodes in a 1-level tree), not to group header chips.
const LEAF_LABEL_MIN_AREA_SHARE = 0.03;

// Bottom inset (px) reserved for the breadcrumb overlay while drilled in.
// Exported so the rounded-corner clip in TreemapChart can match it (otherwise
// the clip rounds the empty breadcrumb strip instead of the drilled tiles).
// Sized so the gap between the chart's bottom edge and the breadcrumb pill is
// 24px: the pill is ~32px tall and sits 8px off the container bottom
// (TreemapBreadcrumb.module.css), so 24 + 32 + 8 = 64.
export const DRILLED_BOTTOM_INSET = 64;

// Font + padding of the group header chip (the parent labels). Exported so the
// component's measurement pass can measure the header text at the exact style
// ECharts renders it, to decide per-group whether the text fits the chip width.
export const GROUP_HEADER_FONT_SIZE = 12;
export const GROUP_HEADER_FONT_WEIGHT = 700;
export const GROUP_HEADER_HEIGHT = 32;
// Horizontal inset on each side of the header text inside the chip.
export const GROUP_HEADER_PADDING_X = 12;

export interface TreemapSeriesNode {
  id: string;
  name: string;
  value: number;
  rawName: TreemapNode["rawName"];
  rowIndices: number[];
  itemStyle?: { color?: string; borderColor?: string };
  label?: { show?: boolean; width?: number };
  upperLabel?: { backgroundColor?: string; color?: string };
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
  showParentLabels = true,
  showLeafLabels = true,
  labelLayout = {},
  parentLabelLayout = {},
  renderingContext,
}: {
  tree: TreemapTree;
  colors?: Record<string, string>;
  isDrilled?: boolean;
  /**
   * Whether the leaf tile labels render. Controlled by the
   * `treemap.show_leaf_labels` setting; applies to the sub-group tiles in a
   * 2-level treemap and to the top-level tiles in a 1-level treemap.
   */
  showLeafLabels?: boolean;
  /**
   * Whether the top-level group header chips (the parent labels) render at the
   * overview. Controlled by the `treemap.show_parent_labels` setting; only
   * meaningful for a 2-level treemap (a 1-level tree has no group headers).
   */
  showParentLabels?: boolean;
  /**
   * Per-leaf label layout (show + wrap width), keyed by node id, measured from
   * the rendered tile after layout (see `model/labels.ts`). Takes precedence
   * over the cheap area-share heuristic below; missing ids fall back to that
   * heuristic (used for the first paint, before any layout exists to measure).
   */
  labelLayout?: Record<string, TreemapLabelLayout>;
  /**
   * Per-group header-text visibility, keyed by group node id, measured from the
   * rendered chip width (see `getTreemapParentLabelLayouts`). When a group maps
   * to `false`, its header chip keeps its band but renders no text — the chip is
   * too narrow to fit even a readable prefix of the label, so showing a one- or
   * two-character truncation is worse than nothing. Wider chips keep the text and
   * let ECharts ellipsis-truncate it. Missing ids default to showing the text
   * (used for the first paint, before any layout exists to measure).
   */
  parentLabelLayout?: Record<string, boolean>;
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
  // them.
  const groupUpperLabel: NonNullable<TreemapChartSeriesOption["upperLabel"]> = {
    show: showParentLabels && !isDrilled,
    height: GROUP_HEADER_HEIGHT,
    color: renderingContext.getColor("text-primary"),
    fontSize: GROUP_HEADER_FONT_SIZE,
    fontWeight: GROUP_HEADER_FONT_WEIGHT,
    // Chip shape; the per-node `backgroundColor` (the group hue with opacity)
    // is set in `toSeriesData`. A per-node `color: "transparent"` there hides the
    // text of any chip too narrow to fit it, while keeping this band.
    padding: [0, GROUP_HEADER_PADDING_X],
  };

  const levels: TreemapSeriesOption["levels"] = [
    // levels[0] → synthetic root. Keep its header off so it reserves no top
    // strip; its `gapWidth` spaces the top-level groups apart. The gaps are
    // filled with this node's `borderColor`; a transparent border reveals the
    // canvas behind instead of painting white separators (which look wrong on a
    // dark-mode background).
    {
      itemStyle: { borderWidth: 0, gapWidth: 2, borderColor: "transparent" },
      upperLabel: { show: false },
    },
    // levels[1] → the groups. The header band lives here. `borderWidth` is kept
    // at 0: a group's bg rect is filled with its `borderColor` (the group hue),
    // so any borderWidth would paint a tinted frame around the group's outer
    // edge. We only want the tint on the inter-leaf gaps, so we rely on
    // `gapWidth` alone; the white between-group separators come from the root's
    // `gapWidth`.
    {
      itemStyle: { borderWidth: 0, gapWidth: 1 },
      colorSaturation: [0.3, 0.5],
      upperLabel: groupUpperLabel,
    },
  ];

  const series: TreemapChartSeriesOption = {
    type: "treemap",
    // Native click is disabled; TreemapChart hijacks `click` to drill into the
    // clicked node's grouping (see TreemapChart/events.ts). `leafDepth: 2` keeps
    // the initial view at two levels.
    nodeClick: false,
    roam: false,
    // ECharts' built-in per-node hover highlight is disabled: hover is shown by
    // washing the whole hovered section (a custom `graphic` overlay driven by
    // `mouseover`/`globalout` in TreemapChart/events.ts), so a second per-tile
    // emphasis on top of it would double up. Disabling emphasis also means the
    // group header no longer enters an emphasis state, so it can't shift on hover.
    emphasis: { disabled: true },
    // A custom React breadcrumb (see TreemapChart) replaces ECharts' native one.
    breadcrumb: { show: false },
    label: {
      ...TREEMAP_CHART_STYLE.nodeLabels,
      // Default leaf-label visibility; per-tile overrides in `toSeriesData` can
      // still hide an individual measured tile, but when leaf labels are turned
      // off this hides every tile the overrides don't touch.
      show: showLeafLabels,
      // Wrap the label to the per-tile `label.width` set in `toSeriesData`
      // (breaking at word boundaries), and drop any lines that don't fit the
      // tile height rather than overflowing it.
      overflow: "break",
      lineOverflow: "truncate",
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
    data: toSeriesData(
      tree,
      colors,
      isDrilled,
      showLeafLabels,
      labelLayout,
      parentLabelLayout,
      renderingContext,
    ),
    leafDepth: 2,
    visibleMin: 25 * 25,
    childrenVisibleMin: 25 * 25,
    ...(hasChildren ? { levels } : {}),
  };

  return { series };
}

function toSeriesData(
  tree: TreemapTree,
  colors: Record<string, string>,
  isDrilled: boolean,
  showLeafLabels: boolean,
  labelLayout: Record<string, TreemapLabelLayout>,
  parentLabelLayout: Record<string, boolean>,
  renderingContext: RenderingContext,
): TreemapSeriesNode[] {
  const headerTintTarget = renderingContext.getColor("white");
  // A leaf's share of the whole chart is its value over the total (the root
  // values already sum the leaves), which equals its share of the rendered area.
  const total = tree.reduce((sum, node) => sum + node.value, 0);
  const isTileTooSmall = (value: number) =>
    total > 0 && value / total < LEAF_LABEL_MIN_AREA_SHARE;

  // Resolve a tile's label: a measured layout (`labelLayout`) wins when present,
  // carrying both the show/hide decision (tiles under the min width hide) and
  // the wrap width. Otherwise fall back to the area-share proxy used for the
  // first paint, before any layout exists to measure. Returns `{}` to leave the
  // label at its default (shown, unwrapped).
  const getLabelOverride = (
    id: string,
    value: number,
  ): Pick<TreemapSeriesNode, "label"> | Record<string, never> => {
    // Leaf labels turned off entirely: hide every tile regardless of fit, so
    // the per-tile measurement can't re-show one the series default hid.
    if (!showLeafLabels) {
      return { label: { show: false } };
    }
    const layout = labelLayout[id];
    if (layout != null) {
      return { label: { show: layout.show, width: layout.width } };
    }
    if (isTileTooSmall(value)) {
      return { label: { show: false } };
    }
    return {};
  };

  return tree.map((node, rootIndex) => {
    const groupColor = colors[String(node.rawName)];
    // A lightened tint of the group hue (mixed toward white), shared by the
    // header chip and the within-group gap borders so they read as one color.
    const groupTint = groupColor
      ? Color(groupColor)
          .mix(Color(headerTintTarget), 1 - GROUP_HEADER_BG_TINT)
          .string()
      : undefined;
    const groupId = getTreemapNodeId(rootIndex);
    // The chip band always renders; we only suppress its text when it's been
    // measured too narrow to fit the full label (`false`). `color: "transparent"`
    // keeps the band (and its background) while hiding the text — better than
    // ECharts truncating to one or two characters plus an ellipsis.
    const upperLabel = {
      ...(groupTint ? { backgroundColor: groupTint } : {}),
      ...(node.children != null && parentLabelLayout[groupId] === false
        ? { color: "transparent" }
        : {}),
    };
    return {
      id: groupId,
      name: node.displayName,
      value: node.value,
      rawName: node.rawName,
      rowIndices: node.rowIndices,
      // For a group (a node with children), ECharts fills the background with
      // the node's borderColor and draws the leaves on top with gaps, so setting
      // borderColor to the group tint paints the within-group gaps in that tint.
      // The between-group separators come from the synthetic root's gaps, whose
      // borderColor is transparent (see levels[0]) so they read as canvas. When
      // drilled into a
      // group it fills the canvas, and we want hueless gaps there — a transparent
      // border reveals the white canvas behind instead of the tint.
      itemStyle: {
        color: groupColor,
        ...(node.children != null
          ? { borderColor: isDrilled ? "transparent" : groupTint }
          : {}),
      },
      // Top-level nodes with children render a header chip (always shown), not
      // their own tile label, so only resolve the label for childless tiles —
      // i.e. a 1-level treemap's tiles.
      ...(node.children == null ? getLabelOverride(groupId, node.value) : {}),
      ...(Object.keys(upperLabel).length > 0 ? { upperLabel } : {}),
      ...(node.children
        ? {
            children: node.children.map((leaf, leafIndex) => ({
              id: getTreemapNodeId(rootIndex, leafIndex),
              name: leaf.displayName,
              value: leaf.value,
              rawName: leaf.rawName,
              rowIndices: leaf.rowIndices,
              ...getLabelOverride(
                getTreemapNodeId(rootIndex, leafIndex),
                leaf.value,
              ),
            })),
          }
        : {}),
    };
  });
}
