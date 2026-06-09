import type { TreemapSeriesOption } from "echarts/charts";

import { formatPercent } from "metabase/static-viz/lib/numbers";
import type { RenderingContext } from "metabase/visualizations/types";

import { getTreemapColors } from "../model/colors";
import {
  HEADER_VALUE_PERCENT_GAP,
  type TreemapLabelLayout,
  type TreemapParentLabelLayout,
} from "../model/labels";
import { getTreemapNodeId } from "../model/tooltip";
import type { TreemapNode, TreemapTree } from "../model/types";
import {
  TREEMAP_CHART_STYLE,
  getGroupHeaderBgTint,
  groupHeader,
  leafBlock,
} from "../style";

// Hide a tile's label once it occupies less than this fraction of the chart
// area. A treemap tile's area is proportional to its value, so a node's share
// of the total is a reliable proxy for its rendered box size — below this,
// the label can't be drawn legibly and ECharts would only truncate it to an
// ellipsis. Applies to tiles that render their own label (leaves in a 2-level
// tree, top-level nodes in a 1-level tree), not to group header chips.
const LEAF_LABEL_MIN_AREA_SHARE = 0.03;

export interface TreemapSeriesNode {
  id: string;
  name: string;
  value: number;
  rawName: TreemapNode["rawName"];
  rowIndices: number[];
  itemStyle?: { color?: string; borderColor?: string };
  label?: {
    show?: boolean;
    width?: number;
    overflow?: "truncate" | "break";
    // Rich-text formatter for the `"full"` stacked block (name/value/percent);
    // absent for the name-only label, which renders the node `name` directly.
    formatter?: string;
  };
  upperLabel?: {
    backgroundColor?: string;
    color?: string;
    // Rich-text formatter + styles for the `name … value pct` header, set only
    // when the chip has room for the right-aligned value+percentage cluster.
    formatter?: string;
    rich?: Record<string, Record<string, unknown>>;
  };
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
  formatValue = (value: number) => String(value),
  renderingContext,
}: {
  tree: TreemapTree;
  colors?: Record<string, string>;
  isDrilled?: boolean;
  /**
   * Column-aware formatter for the metric value, used to build the inline
   * `"full"` block's value line (and shared with the measurement pass so the
   * width it measures matches what renders). Defaults to `String`.
   */
  formatValue?: (value: number) => string;
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
  parentLabelLayout?: Record<string, TreemapParentLabelLayout>;
  renderingContext: RenderingContext;
}): {
  series: TreemapChartSeriesOption;
} {
  const hasChildren = tree.some((node) => node.children != null);

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
    height: groupHeader.height,
    color: renderingContext.getColor("text-primary"),
    fontSize: groupHeader.fontSize,
    fontWeight: groupHeader.fontWeight,
    lineHeight: groupHeader.height,
    // Chip shape; the per-node `backgroundColor` (the group hue with opacity)
    // is set in `toSeriesData`. A per-node `color: "transparent"` there hides the
    // text of any chip too narrow to fit it, while keeping this band.
    padding: [0, groupHeader.paddingX],
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
    nodeClick: false,
    roam: false,
    // We're adding custom hover effect to be able to highlight the whole group.
    emphasis: { disabled: true },
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
      // Rich styles for the inline `"full"` block (name / value / percentage).
      // Defined once here and referenced by the per-tile `label.formatter`
      // strings built in `toSeriesData`; the name-only label ignores them.
      rich: getLeafLabelRich(renderingContext),
    },
    upperLabel: { show: false },
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    data: toSeriesData(
      tree,
      colors,
      isDrilled,
      showLeafLabels,
      labelLayout,
      parentLabelLayout,
      formatValue,
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
  parentLabelLayout: Record<string, TreemapParentLabelLayout>,
  formatValue: (value: number) => string,
  renderingContext: RenderingContext,
): TreemapSeriesNode[] {
  const headerTintTarget = renderingContext.getColor("white");
  // A leaf's share of the whole chart is its value over the total (the root
  // values already sum the leaves), which equals its share of the rendered area.
  const total = tree.reduce((sum, node) => sum + node.value, 0);
  const isTileTooSmall = (value: number) =>
    total > 0 && value / total < LEAF_LABEL_MIN_AREA_SHARE;
  const formatShare = (value: number) =>
    formatPercent(total === 0 ? 0 : value / total);

  // Resolve a tile's label from its measured detail level (`labelLayout`):
  // - `"full"` → the stacked name + value + percentage block (a rich-text
  //   formatter referencing the series `label.rich`), truncated to the tile;
  // - `"labelOnly"` → the name alone, wrapped to the tile width (the default);
  // - `"none"` → hidden.
  // Before any layout exists to measure, fall back to the cheap area-share
  // proxy (name-only, or hidden for tiles too small to read).
  const getLabelOverride = (
    id: string,
    value: number,
    displayName: string,
  ): Pick<TreemapSeriesNode, "label"> | Record<string, never> => {
    // Leaf labels turned off entirely: hide every tile regardless of fit, so
    // the per-tile measurement can't re-show one the series default hid.
    if (!showLeafLabels) {
      return { label: { show: false } };
    }
    const layout = labelLayout[id];
    if (layout != null) {
      if (layout.detail === "none") {
        return { label: { show: false, width: layout.width } };
      }
      if (layout.detail === "full") {
        return {
          label: {
            show: true,
            width: layout.width,
            // The value/percentage lines must stay on one line each, so truncate
            // rather than wrap (the name-only label keeps the series' "break").
            overflow: "truncate",
            formatter: getFullBlockFormatter(
              displayName,
              formatValue(value),
              formatShare(value),
            ),
          },
        };
      }
      return { label: { show: true, width: layout.width } };
    }
    if (isTileTooSmall(value)) {
      return { label: { show: false } };
    }
    return {};
  };

  return tree.map((node, rootIndex) => {
    const groupColor = colors[String(node.rawName)];
    const groupTint = getGroupHeaderBgTint(groupColor, headerTintTarget);
    const groupId = getTreemapNodeId(rootIndex);

    const upperLabel = getUpperLabel({
      groupTint,
      hasChildren: node.children !== null,
      layout: parentLabelLayout[groupId],
      displayName: node.displayName,
      valueLabel: formatValue(node.value),
      percentLabel: formatShare(node.value),
      renderingContext,
    });

    const itemStyle = getItemStyle({
      groupColor,
      groupTint,
      hasChildren: node.children !== null,
      isDrilled,
    });

    return {
      id: groupId,
      name: node.displayName,
      value: node.value,
      rawName: node.rawName,
      rowIndices: node.rowIndices,
      itemStyle,
      // Top-level nodes with children render a header chip (always shown), not
      // their own tile label, so only resolve the label for childless tiles —
      // i.e. a 1-level treemap's tiles.
      ...(node.children == null
        ? getLabelOverride(groupId, node.value, node.displayName)
        : {}),
      upperLabel,
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
                leaf.displayName,
              ),
            })),
          }
        : {}),
    };
  });
}

/**
 * Rich-text styles for the inline `"full"` block, referenced by the per-tile
 * `label.formatter` strings (`{name|…}`, `{value|…}`, `{pct|…}`). The name
 * matches the name-only label (bold 12); the value is the H3 style (bold 20);
 * the percentage is regular 12. All three are white with the leaf label's text
 * shadow (tiles are colored). `value`/`pct` carry a top padding for the vertical
 * gap above each line. Colors go through `renderingContext.getColor` to satisfy
 * the no-color-literals rule.
 */
function getLeafLabelRich(renderingContext: RenderingContext) {
  const color = renderingContext.getColor("white");
  const {
    fontFamily,
    textShadowColor,
    textShadowBlur,
    textShadowOffsetX,
    textShadowOffsetY,
  } = TREEMAP_CHART_STYLE.nodeLabels;
  const shadow = {
    fontFamily,
    color,
    textShadowColor,
    textShadowBlur,
    textShadowOffsetX,
    textShadowOffsetY,
  };
  return {
    name: {
      ...shadow,
      fontSize: leafBlock.name.fontSize,
      fontWeight: leafBlock.name.fontWeight,
      height: leafBlock.name.height,
      verticalAlign: "middle" as const,
    },
    value: {
      ...shadow,
      fontSize: leafBlock.value.fontSize,
      fontWeight: leafBlock.value.fontWeight,
      padding: [leafBlock.valueGap, 0, 0, 0],
      height: leafBlock.value.height,
      verticalAlign: "middle" as const,
    },
    pct: {
      ...shadow,
      fontSize: leafBlock.percent.fontSize,
      fontWeight: leafBlock.percent.fontWeight,
      height: leafBlock.percent.height,
      lineHeight: leafBlock.percent.height,
      padding: [leafBlock.percentGap, 0, 0, 0],
      verticalAlign: "middle" as const,
    },
  };
}

/**
 * The rich-text formatter string for a `"full"` tile: the name, value, and
 * percentage stacked on three lines, each tagged with its rich style (see
 * `getLeafLabelRich`). Note: a category name containing `{` or `}` would break
 * ECharts' rich-text parsing — acceptable for now (rare), flagged for review.
 */
function getFullBlockFormatter(
  name: string,
  valueLabel: string,
  percentLabel: string,
): string {
  return `{name|${name}}\n{value|${valueLabel}}\n{pct|${percentLabel}}`;
}

function getItemStyle({
  groupColor,
  groupTint,
  isDrilled,
}: {
  groupColor: string | undefined;
  groupTint: string | undefined;
  hasChildren: boolean;
  isDrilled: boolean;
}) {
  return {
    color: groupColor,
    borderColor: isDrilled ? "transparent" : groupTint,
  };
}

function getUpperLabel({
  groupTint,
  hasChildren,
  layout,
  displayName,
  valueLabel,
  percentLabel,
  renderingContext,
}: {
  groupTint: string | undefined;
  hasChildren: boolean;
  layout: TreemapParentLabelLayout | undefined;
  displayName: string;
  valueLabel: string;
  percentLabel: string;
  renderingContext: RenderingContext;
}): TreemapSeriesNode["upperLabel"] {
  // When the chip has room, render the name in a fixed-width left column with
  // the value + percentage flush right (see `getHeaderValuePercent`). The name
  // column width comes from the measured layout (`model/labels.ts`).
  if (
    hasChildren &&
    layout?.showValuePercent &&
    layout.nameColumnWidth != null
  ) {
    return {
      backgroundColor: groupTint,
      ...getHeaderValuePercent({
        displayName,
        valueLabel,
        percentLabel,
        nameColumnWidth: layout.nameColumnWidth,
        renderingContext,
      }),
    };
  }

  // Otherwise the chip shows the name alone: transparent when too narrow to fit
  // even a readable prefix (keeping the band), else the level's default color.
  const color =
    hasChildren && layout?.showText === false ? "transparent" : undefined;

  const label = {
    backgroundColor: groupTint,
    color,
  };

  if (Object.values(label).every((value) => value === undefined)) {
    return undefined;
  }

  return label;
}

/**
 * The `formatter` + `rich` for a group header that shows its value + percentage:
 * the name in a fixed-width left column (truncated), then the value (bold, like
 * the name) and the percentage (regular, secondary) flush right. The name
 * column's `width` plus the left paddings on the value/percentage push the
 * cluster to the chip's right edge. Colors go through `renderingContext.getColor`
 * to satisfy the no-color-literals rule.
 */
function getHeaderValuePercent({
  displayName,
  valueLabel,
  percentLabel,
  nameColumnWidth,
  renderingContext,
}: {
  displayName: string;
  valueLabel: string;
  percentLabel: string;
  nameColumnWidth: number;
  renderingContext: RenderingContext;
}) {
  const textPrimary = renderingContext.getColor("text-primary");
  const textSecondary = renderingContext.getColor("text-secondary");
  return {
    formatter: `{name|${displayName}}{value|${valueLabel}}{pct|${percentLabel}}`,
    rich: {
      name: {
        width: nameColumnWidth,
        overflow: "truncate",
        align: "left",
        color: textPrimary,
        fontSize: groupHeader.fontSize,
        fontWeight: groupHeader.fontWeight,
      },
      value: {
        color: textPrimary,
        fontSize: groupHeader.fontSize,
        fontWeight: groupHeader.fontWeight,
        // Gap between the name column and the value.
        padding: [0, 0, 0, HEADER_VALUE_PERCENT_GAP],
      },
      pct: {
        color: textSecondary,
        fontSize: groupHeader.fontSize,
        fontWeight: groupHeader.percentFontWeight,
        // Gap between the value and the percentage.
        padding: [0, 0, 0, groupHeader.valuePercentGap],
      },
    },
  };
}
