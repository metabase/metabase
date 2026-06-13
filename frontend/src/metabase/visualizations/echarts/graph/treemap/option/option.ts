import type { TreemapSeriesOption } from "echarts/charts";
import { match } from "ts-pattern";

import type { RenderingContext } from "metabase/visualizations/types";

import { getTreemapColors } from "../model/colors";
import { getTreemapNodeKey } from "../model/data";
import type { ParentLabelLayout, TreemapLabelLayout } from "../model/labels";
import { getTreemapPercentOfTotalFormatter } from "../model/share";
import { getTreemapNodeId } from "../model/tooltip";
import { hasChildren } from "../model/tree";
import type {
  TreemapNode,
  TreemapSeriesNode,
  TreemapTree,
} from "../model/types";
import {
  TREEMAP_CHART_STYLE,
  getGroupHeaderBgTint,
  groupHeader,
} from "../style";
import { getRichLeafLabel, getRichUpperLabel } from "../style-rich";

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
  parentLabelLayout?: Record<string, ParentLabelLayout>;
  renderingContext: RenderingContext;
}): {
  series: TreemapChartSeriesOption;
} {
  const hasNestedChildren = tree.some(hasChildren);

  const groupUpperLabel = getUpperLabelDefault({
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
    emphasis: { disabled: true }, // We're adding custom hover effect to be able to highlight the whole group.
    breadcrumb: { show: false },
    label: getTileLabelDefault({ showLeafLabels, renderingContext }),
    upperLabel: { show: false },
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    leafDepth: 2,
    visibleMin: 25 * 25,
    childrenVisibleMin: 25 * 25,
    levels: hasNestedChildren ? [rootLevel, groupLevel] : [rootLevel],
    data: toSeriesData({
      tree,
      colors,
      isDrilled,
      showLeafLabels,
      labelLayout,
      parentLabelLayout,
      formatValue,
      renderingContext,
    }),
  };

  return { series };
}

function toSeriesData({
  tree,
  colors,
  isDrilled,
  showLeafLabels,
  labelLayout,
  parentLabelLayout,
  formatValue,
  renderingContext,
}: {
  tree: TreemapTree;
  colors: Record<string, string>;
  isDrilled: boolean;
  showLeafLabels: boolean;
  labelLayout: Record<string, TreemapLabelLayout>;
  parentLabelLayout: Record<string, ParentLabelLayout>;
  formatValue: (value: number) => string;
  renderingContext: RenderingContext;
}): TreemapSeriesNode[] {
  const headerTintTarget = renderingContext.getColor("white");
  const formatPercentOfTotal = getTreemapPercentOfTotalFormatter(tree);

  return tree.map((node, rootIndex) =>
    toGroupSeriesNode({
      node,
      rootIndex,
      colors,
      headerTintTarget,
      isDrilled,
      showLeafLabels,
      labelLayout,
      parentLabelLayout,
      formatValue,
      formatPercentOfTotal,
      renderingContext,
    }),
  );
}

function toGroupSeriesNode({
  node,
  rootIndex,
  colors,
  headerTintTarget,
  isDrilled,
  showLeafLabels,
  labelLayout,
  parentLabelLayout,
  formatValue,
  formatPercentOfTotal,
  renderingContext,
}: {
  node: TreemapNode;
  rootIndex: number;
  colors: Record<string, string>;
  headerTintTarget: string;
  isDrilled: boolean;
  showLeafLabels: boolean;
  labelLayout: Record<string, TreemapLabelLayout>;
  parentLabelLayout: Record<string, ParentLabelLayout>;
  formatValue: (value: number) => string;
  formatPercentOfTotal: (value: number) => string;
  renderingContext: RenderingContext;
}): TreemapSeriesNode {
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
        id: groupId,
        value: node.value,
        displayName: node.displayName,
        showLeafLabels,
        labelLayout,
        formatValue,
        formatPercentOfTotal,
      }),
    };
  }

  return {
    ...groupNode,
    children: node.children.map((leaf, leafIndex) =>
      toLeafSeriesNode({
        leaf,
        rootIndex,
        leafIndex,
        showLeafLabels,
        labelLayout,
        formatValue,
        formatPercentOfTotal,
      }),
    ),
  };
}

function toLeafSeriesNode({
  leaf,
  rootIndex,
  leafIndex,
  showLeafLabels,
  labelLayout,
  formatValue,
  formatPercentOfTotal,
}: {
  leaf: TreemapNode;
  rootIndex: number;
  leafIndex: number;
  showLeafLabels: boolean;
  labelLayout: Record<string, TreemapLabelLayout>;
  formatValue: (value: number) => string;
  formatPercentOfTotal: (value: number) => string;
}): TreemapSeriesNode {
  const leafId = getTreemapNodeId(rootIndex, leafIndex);

  return {
    id: leafId,
    name: leaf.displayName,
    value: leaf.value,
    rawName: leaf.rawName,
    rowIndices: leaf.rowIndices,
    ...getTileLabelOverride({
      id: leafId,
      value: leaf.value,
      displayName: leaf.displayName,
      showLeafLabels,
      labelLayout,
      formatValue,
      formatPercentOfTotal,
    }),
  };
}

const formatters = {
  getLeafFormatter(
    name: string,
    valueLabel: string,
    percentLabel: string,
  ): string {
    return `{name|${name}}\n{value|${valueLabel}}\n{pct|${percentLabel}}`;
  },
};

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
    show: showLeafLabels,
    overflow: "break",
    lineOverflow: "truncate",
    rich: getRichLeafLabel(renderingContext),
  };
}

function getTileLabelOverride({
  id,
  value,
  displayName,
  showLeafLabels,
  labelLayout,
  formatValue,
  formatPercentOfTotal,
}: {
  id: string;
  value: number;
  displayName: string;
  showLeafLabels: boolean;
  labelLayout: Record<string, TreemapLabelLayout>;
  formatValue: (value: number) => string;
  formatPercentOfTotal: (value: number) => string;
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
        formatter: formatters.getLeafFormatter(
          displayName,
          formatValue(value),
          formatPercentOfTotal(value),
        ),
      },
    }))
    .otherwise(() => ({ label: { show: true, width: layout.width } }));
}

function getUpperLabelDefault({
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
