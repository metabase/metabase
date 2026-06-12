import type { TreemapSeriesOption } from "echarts/charts";
import { match } from "ts-pattern";

import { formatPercent } from "metabase/static-viz/lib/numbers";
import type { RenderingContext } from "metabase/visualizations/types";

import { getTreemapColors } from "../model/colors";
import { getTreemapNodeKey } from "../model/data";
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

const HIDDEN_LABEL_OVERRIDE: Pick<TreemapSeriesNode, "label"> = {
  label: { show: false },
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
  formatValue?: (value: number) => string;
  showLeafLabels?: boolean;
  showParentLabels?: boolean;
  labelLayout?: Record<string, TreemapLabelLayout>;
  parentLabelLayout?: Record<string, TreemapParentLabelLayout>;
  renderingContext: RenderingContext;
}): {
  series: TreemapChartSeriesOption;
} {
  const hasNestedChildren = tree.some(hasChildren);

  const groupUpperLabel = getGroupUpperLabel({
    showParentLabels,
    isDrilled,
    renderingContext,
  });

  const rootLevel: NonNullable<TreemapSeriesOption["levels"]>[number] = {
    itemStyle: { borderWidth: 0, gapWidth: 2, borderColor: "transparent" },
    upperLabel: { show: false },
  };

  const groupLevel: NonNullable<TreemapSeriesOption["levels"]>[number] = {
    itemStyle: { borderWidth: 0, gapWidth: 1 },
    colorSaturation: [0.3, 0.5],
    upperLabel: groupUpperLabel,
  };

  const series: TreemapChartSeriesOption = {
    type: "treemap",
    nodeClick: false,
    roam: false,
    // We're adding custom hover effect to be able to highlight the whole group.
    emphasis: { disabled: true },
    breadcrumb: { show: false },
    label: {
      ...TREEMAP_CHART_STYLE.nodeLabels,
      show: showLeafLabels,
      overflow: "break",
      lineOverflow: "truncate",
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
    levels: hasNestedChildren ? [rootLevel, groupLevel] : [rootLevel],
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
  const total = tree.reduce((sum, node) => sum + node.value, 0);
  const formatShare = (value: number) =>
    formatPercent(total === 0 ? 0 : value / total);

  return tree.map((node, rootIndex) => {
    const groupColor = colors[getTreemapNodeKey(node)];
    const groupTint = getGroupHeaderBgTint(groupColor, headerTintTarget);
    const groupId = getTreemapNodeId(rootIndex);

    const upperLabel = getUpperLabel({
      groupTint,
      hasChildren: hasChildren(node),
      layout: parentLabelLayout[groupId],
      displayName: node.displayName,
      valueLabel: formatValue(node.value),
      percentLabel: formatShare(node.value),
      renderingContext,
    });

    const itemStyle = getItemStyle({
      groupColor,
      groupTint,
      hasChildren: hasChildren(node),
      isDrilled,
    });

    return {
      id: groupId,
      name: node.displayName,
      value: node.value,
      rawName: node.rawName,
      rowIndices: node.rowIndices,
      itemStyle,
      ...(!hasChildren(node)
        ? getLabelOverride({
            id: groupId,
            value: node.value,
            displayName: node.displayName,
            showLeafLabels,
            labelLayout,
            formatValue,
            formatShare,
          })
        : {}),
      upperLabel,
      ...(hasChildren(node)
        ? {
            children: node.children.map((leaf, leafIndex) => ({
              id: getTreemapNodeId(rootIndex, leafIndex),
              name: leaf.displayName,
              value: leaf.value,
              rawName: leaf.rawName,
              rowIndices: leaf.rowIndices,
              ...getLabelOverride({
                id: getTreemapNodeId(rootIndex, leafIndex),
                value: leaf.value,
                displayName: leaf.displayName,
                showLeafLabels,
                labelLayout,
                formatValue,
                formatShare,
              }),
            })),
          }
        : {}),
    };
  });
}

function getLabelOverride({
  id,
  value,
  displayName,
  showLeafLabels,
  labelLayout,
  formatValue,
  formatShare,
}: {
  id: string;
  value: number;
  displayName: string;
  showLeafLabels: boolean;
  labelLayout: Record<string, TreemapLabelLayout>;
  formatValue: (value: number) => string;
  formatShare: (value: number) => string;
}): Pick<TreemapSeriesNode, "label"> {
  if (!showLeafLabels) {
    return HIDDEN_LABEL_OVERRIDE;
  }
  const layout = labelLayout[id];
  if (layout == null) {
    return HIDDEN_LABEL_OVERRIDE;
  }
  return match(layout.detail)
    .with("none", () => HIDDEN_LABEL_OVERRIDE)
    .with("full", () => ({
      label: {
        show: true,
        width: layout.width,
        overflow: "truncate" as const,
        formatter: getFullBlockFormatter(
          displayName,
          formatValue(value),
          formatShare(value),
        ),
      },
    }))
    .otherwise(() => ({ label: { show: true, width: layout.width } }));
}

function hasChildren(
  node: TreemapNode,
): node is TreemapNode & { children: NonNullable<TreemapNode["children"]> } {
  return node.children != null;
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
  hasChildren,
  isDrilled,
}: {
  groupColor: string | undefined;
  groupTint: string | undefined;
  hasChildren: boolean;
  isDrilled: boolean;
}) {
  return {
    color: groupColor,
    ...(hasChildren
      ? { borderColor: isDrilled ? "transparent" : groupTint }
      : {}),
  };
}

function getGroupUpperLabel({
  showParentLabels,
  isDrilled,
  renderingContext,
}: {
  showParentLabels: boolean;
  isDrilled: boolean;
  renderingContext: RenderingContext;
}): NonNullable<TreemapChartSeriesOption["upperLabel"]> {
  return {
    show: showParentLabels && !isDrilled,
    color: renderingContext.getColor("text-primary"),
    height: groupHeader.height,
    fontSize: groupHeader.fontSize,
    fontWeight: groupHeader.fontWeight,
    lineHeight: groupHeader.height,
    padding: [0, groupHeader.paddingX],
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
