import type { TreemapSeriesOption } from "echarts/charts";
import { match } from "ts-pattern";

import { formatPercent as formatPercentDefault } from "metabase/static-viz/lib/numbers";
import { getTextColorForBackground } from "metabase/ui/colors";
import { truncateText } from "metabase/visualizations/lib/text";
import type { RenderingContext } from "metabase/visualizations/types";

import { getTreemapColors, getTreemapLeafColor } from "../model/colors";
import { getTreemapNodeKey } from "../model/data";
import { getTreemapPercentOfTotalFormatter } from "../model/formatters";
import type { ParentLabelLayout, TreemapLabelLayout } from "../model/labels";
import type { TreemapMeasuredLabelLayouts } from "../model/measure";
import { getTreemapNodeId, hasChildren } from "../model/tree";
import type {
  TreemapNode,
  TreemapSeriesNode,
  TreemapTree,
} from "../model/types";
import { getLeafPercentLabel } from "../model/value";
import {
  TREEMAP_CHART_STYLE,
  getGroupHeaderBgTint,
  groupHeader,
  leafBlock,
} from "../style";
import {
  getLeafFormatter,
  getLeafLabelStyle,
  getRichLeafLabel,
  getRichUpperLabel,
  sanitizeRichTextContent,
} from "../style.rich";

type TreemapChartSeriesOption = TreemapSeriesOption & {
  type: "treemap";
  data: TreemapSeriesNode[];
};

export type TreemapChartOptionConfig = {
  tree: TreemapTree;
  colors?: Record<string, string>;
  isDrilled?: boolean;
  formatValue?: (value: number) => string;
  formatPercent?: (ratio: number) => string;
  showLeafLabels?: boolean;
  showParentLabels?: boolean;
  isCompact?: boolean;
  labelLayout?: Record<string, TreemapLabelLayout>;
  parentLabelLayout?: Record<string, ParentLabelLayout>;
  renderingContext: RenderingContext;
};

type TreemapSeriesBuildConfig = {
  colors: Record<string, string>;
  isDrilled: boolean;
  showLeafLabels: boolean;
  labelLayout: Record<string, TreemapLabelLayout>;
  parentLabelLayout: Record<string, ParentLabelLayout>;
  formatValue: (value: number) => string;
  formatPercent: (ratio: number) => string;
  formatPercentOfTotal: (value: number) => string;
  headerTintTarget: string;
  renderingContext: RenderingContext;
};

const HIDDEN_LABEL_OVERRIDE: Pick<TreemapSeriesNode, "label"> = {
  label: { show: false },
};

const MIN_TILE_SIZE = 25 * 25;

export function getTreemapChartOption(config: TreemapChartOptionConfig): {
  series: TreemapChartSeriesOption;
} {
  const {
    tree,
    showParentLabels = true,
    isCompact = false,
    renderingContext,
  } = config;
  const buildConfig = createSeriesBuildConfig(config);
  const hasNestedChildren = tree.some(hasChildren);

  const groupUpperLabel = getUpperLabelDefault({
    showParentLabels,
    isDrilled: buildConfig.isDrilled,
    isCompact,
    renderingContext,
  });

  const rootLevel: NonNullable<TreemapSeriesOption["levels"]>[number] = {
    itemStyle: { borderWidth: 0, gapWidth: 2, borderColor: "transparent" },
    upperLabel: { show: false },
  };

  const groupLevel: NonNullable<TreemapSeriesOption["levels"]>[number] = {
    itemStyle: { borderWidth: 0, gapWidth: 1 },
    upperLabel: groupUpperLabel,
    // no label by default for groups; this is overridden on per-group basis
    label: { show: false },
  };

  const series: TreemapChartSeriesOption = {
    type: "treemap",
    nodeClick: false,
    roam: false,
    emphasis: { disabled: true }, // We're adding custom hover effect to be able to highlight the whole group.
    breadcrumb: { show: false },
    label: getTileLabelDefault({
      showLeafLabels: buildConfig.showLeafLabels,
      renderingContext,
    }),
    upperLabel: { show: false },
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    leafDepth: 2,
    visibleMin: MIN_TILE_SIZE,
    childrenVisibleMin: MIN_TILE_SIZE,
    levels: hasNestedChildren ? [rootLevel, groupLevel] : [rootLevel],
    data: toSeriesData({ tree, config: buildConfig }),
  };

  return { series };
}

function createSeriesBuildConfig({
  tree,
  colors = getTreemapColors(tree),
  isDrilled = false,
  showLeafLabels = true,
  labelLayout = {},
  parentLabelLayout = {},
  formatValue = (value: number) => String(value),
  formatPercent = formatPercentDefault,
  renderingContext,
}: TreemapChartOptionConfig): TreemapSeriesBuildConfig {
  return {
    colors,
    isDrilled,
    showLeafLabels,
    labelLayout,
    parentLabelLayout,
    formatValue,
    formatPercent,
    formatPercentOfTotal: getTreemapPercentOfTotalFormatter(
      tree,
      formatPercent,
    ),
    headerTintTarget: renderingContext.getColor("white"),
    renderingContext,
  };
}

function toSeriesData({
  tree,
  config,
}: {
  tree: TreemapTree;
  config: TreemapSeriesBuildConfig;
}): TreemapSeriesNode[] {
  return tree.map((node, rootIndex) =>
    toGroupSeriesNode({ config, node, rootIndex }),
  );
}

function toGroupSeriesNode({
  config,
  node,
  rootIndex,
}: {
  config: TreemapSeriesBuildConfig;
  node: TreemapNode;
  rootIndex: number;
}): TreemapSeriesNode {
  const {
    colors,
    headerTintTarget,
    isDrilled,
    parentLabelLayout,
    formatValue,
    formatPercentOfTotal,
    renderingContext,
  } = config;
  const groupColor = colors[getTreemapNodeKey(node)];
  const groupTint = getGroupHeaderBgTint(groupColor, headerTintTarget);
  const groupId = getTreemapNodeId(rootIndex);
  const nodeHasChildren = hasChildren(node);
  const valueLabel = formatValue(node.value);
  const percentLabel = formatPercentOfTotal(node.value);

  const upperLabel = getUpperLabelOverride({
    groupTint,
    hasChildren: nodeHasChildren,
    layout: parentLabelLayout[groupId],
    displayName: node.displayName,
    valueLabel,
    percentLabel,
    renderingContext,
  });

  const itemStyle = getItemStyle({
    groupColor,
    groupTint,
    hasChildren: nodeHasChildren,
    isDrilled,
  });

  const groupNode: TreemapSeriesNode = {
    id: groupId,
    name: node.displayName,
    value: node.value,
    rawName: node.rawName,
    rowIndices: node.rowIndices,
    itemStyle,
    upperLabel,
  };

  if (!nodeHasChildren) {
    return {
      ...groupNode,
      ...getTileLabelOverride({
        config,
        id: groupId,
        value: node.value,
        displayName: node.displayName,
        backgroundColor: groupColor,
      }),
    };
  }

  const childValues = node.children.map((child) => child.value);
  const minChildValue = Math.min(...childValues);
  const maxChildValue = Math.max(...childValues);

  return {
    ...groupNode,
    children: node.children.map((leaf, leafIndex) =>
      toLeafSeriesNode({
        config,
        leaf,
        parentValue: node.value,
        rootIndex,
        leafIndex,
        color: getTreemapLeafColor(
          groupColor,
          leaf.value,
          minChildValue,
          maxChildValue,
        ),
      }),
    ),
  };
}

function toLeafSeriesNode({
  config,
  leaf,
  parentValue,
  rootIndex,
  leafIndex,
  color,
}: {
  config: TreemapSeriesBuildConfig;
  leaf: TreemapNode;
  parentValue: number;
  rootIndex: number;
  leafIndex: number;
  color: string | undefined;
}): TreemapSeriesNode {
  const leafId = getTreemapNodeId(rootIndex, leafIndex);

  return {
    id: leafId,
    name: leaf.displayName,
    value: leaf.value,
    rawName: leaf.rawName,
    rowIndices: leaf.rowIndices,
    itemStyle: { color },
    ...getTileLabelOverride({
      config,
      id: leafId,
      value: leaf.value,
      displayName: leaf.displayName,
      parentValue,
      backgroundColor: color,
    }),
  };
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

function getTileLabelDefault({
  showLeafLabels,
  renderingContext,
}: {
  showLeafLabels: boolean;
  renderingContext: RenderingContext;
}): NonNullable<TreemapChartSeriesOption["label"]> {
  return {
    ...TREEMAP_CHART_STYLE.nodeLabels,
    fontFamily: renderingContext.fontFamily,
    show: showLeafLabels,
    overflow: "break",
    lineOverflow: "truncate",
    rich: getRichLeafLabel(renderingContext),
  };
}

function getTileLabelOverride({
  config,
  id,
  value,
  displayName,
  parentValue,
  backgroundColor,
}: {
  config: TreemapSeriesBuildConfig;
  id: string;
  value: number;
  displayName: string;
  parentValue?: number;
  backgroundColor: string | undefined;
}): Pick<TreemapSeriesNode, "label"> {
  const {
    showLeafLabels,
    isDrilled,
    labelLayout,
    formatValue,
    formatPercent,
    formatPercentOfTotal,
    renderingContext,
  } = config;
  if (!showLeafLabels) {
    return HIDDEN_LABEL_OVERRIDE;
  }
  const layout = labelLayout[id];
  if (layout == null) {
    return HIDDEN_LABEL_OVERRIDE;
  }
  const textColor = backgroundColor
    ? getTextColorForBackground(backgroundColor, renderingContext.getColor)
    : undefined;
  const leafLabelStyle = getLeafLabelStyle(renderingContext, textColor);
  // ECharts truncation is unreliable, so we use our own truncation logic
  const leafName = truncateText(
    displayName,
    layout.width,
    renderingContext.measureText,
    {
      size: leafBlock.name.fontSize,
      family: renderingContext.fontFamily,
      weight: leafBlock.name.fontWeight,
    },
  );

  return match(layout.detail)
    .with("none", () => HIDDEN_LABEL_OVERRIDE)
    .with("full", () => ({
      label: {
        show: true,
        width: layout.width,
        overflow: "truncate" as const,
        ...leafLabelStyle,
        formatter: getLeafFormatter(
          leafName,
          formatValue(value),
          getLeafPercentLabel({
            isDrilled,
            value,
            parentValue,
            formatPercentOfTotal,
            formatPercent,
          }),
        ),
      },
    }))
    .otherwise(() => ({
      label: {
        show: true,
        width: layout.width,
        overflow: "truncate" as const,
        ...leafLabelStyle,
        formatter: sanitizeRichTextContent(leafName),
      },
    }));
}

function getUpperLabelDefault({
  showParentLabels,
  isDrilled,
  isCompact,
  renderingContext,
}: {
  showParentLabels: boolean;
  isDrilled: boolean;
  isCompact: boolean;
  renderingContext: RenderingContext;
}): NonNullable<TreemapChartSeriesOption["upperLabel"]> {
  const height = isCompact ? groupHeader.compactHeight : groupHeader.height;
  return {
    show: showParentLabels && !isDrilled,
    color: renderingContext.getColor("text-primary"),
    height,
    fontFamily: renderingContext.fontFamily,
    fontSize: groupHeader.fontSize,
    fontWeight: groupHeader.fontWeight,
    lineHeight: height,
    padding: [0, groupHeader.paddingX],
    overflow: "truncate",
  };
}

function getUpperLabelOverride({
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
  layout: ParentLabelLayout | undefined;
  displayName: string;
  valueLabel: string;
  percentLabel: string;
  renderingContext: RenderingContext;
}): TreemapSeriesNode["upperLabel"] {
  if (
    hasChildren &&
    layout?.showValuePercent &&
    layout.nameColumnWidth != null
  ) {
    return getRichUpperLabel({
      groupTint,
      displayName,
      valueLabel,
      percentLabel,
      nameColumnWidth: layout.nameColumnWidth,
      renderingContext,
    });
  }

  const color =
    hasChildren && layout?.showText === false ? "transparent" : undefined;

  const basicLabel = {
    backgroundColor: groupTint,
    color,
  };

  if (Object.values(basicLabel).every((value) => value === undefined)) {
    return undefined;
  }

  return basicLabel;
}

export function getStaticTreemapOption(
  config: TreemapChartOptionConfig,
  layouts?: Partial<TreemapMeasuredLabelLayouts>,
): {
  series: TreemapChartSeriesOption;
  animation: boolean;
} {
  const option = getTreemapChartOption({
    ...config,
    labelLayout: layouts?.leafLabelLayout,
    parentLabelLayout: layouts?.parentLabelLayout,
  });

  return {
    ...option,
    animation: false,
  };
}
