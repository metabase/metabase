import { t } from "ttag";

import { formatPercent } from "metabase/static-viz/lib/numbers";
import type {
  EChartsTooltipModel,
  EChartsTooltipRow,
} from "metabase/visualizations/components/ChartTooltip/EChartsTooltip";
import { getMarkerColorClass } from "metabase/visualizations/echarts/tooltip";

import type { ParentLabelLayout, TreemapLabelLayout } from "./labels";
import type { TreemapNode, TreemapTree } from "./types";

export interface TreemapTooltipContext {
  header?: string;
  siblings: TreemapTree;
  focusedNode: TreemapNode;
  parentNode?: TreemapNode;
}

export interface TreemapInlineValueIds {
  fullLeafIds: Set<string>;
  valuePercentHeaderIds: Set<string>;
}

export function getTreemapInlineValueIds(
  labelLayout: Record<string, TreemapLabelLayout>,
  parentLabelLayout: Record<string, ParentLabelLayout>,
): TreemapInlineValueIds {
  const fullLeafIds = new Set<string>();
  for (const [id, layout] of Object.entries(labelLayout)) {
    if (layout.detail === "full") {
      fullLeafIds.add(id);
    }
  }
  const valuePercentHeaderIds = new Set<string>();
  for (const [id, layout] of Object.entries(parentLabelLayout)) {
    if (layout.showValuePercent) {
      valuePercentHeaderIds.add(id);
    }
  }
  return { fullLeafIds, valuePercentHeaderIds };
}

export function isTreemapTooltipSuppressed(
  id: string,
  viewRootId: string | null,
  isTwoLevel: boolean,
  { fullLeafIds, valuePercentHeaderIds }: TreemapInlineValueIds,
): boolean {
  if (viewRootId == null && isTwoLevel) {
    const [rootPart] = id.split("-");
    return valuePercentHeaderIds.has(rootPart);
  }
  return fullLeafIds.has(id);
}

export function getTreemapTooltipContext(
  tree: TreemapTree,
  id: string,
  viewRootId: string | null,
  groupingHeader?: string,
): TreemapTooltipContext | null {
  const [rootPart, leafPart] = id.split("-");

  if (viewRootId == null) {
    const focusedNode = tree[Number(rootPart)];
    if (focusedNode == null) {
      return null;
    }
    return { header: groupingHeader, siblings: tree, focusedNode };
  }

  const root = tree[Number(viewRootId)];
  const siblings = root?.children;
  const focusedNode = siblings?.[Number(leafPart)];
  if (root == null || siblings == null || focusedNode == null) {
    return null;
  }

  return {
    header: root.displayName,
    siblings,
    focusedNode,
    parentNode: root,
  };
}

export function getTreemapTooltipModel(
  context: TreemapTooltipContext,
  getColor: (node: TreemapNode) => string | undefined,
  formatValue: (value: number) => string,
): EChartsTooltipModel {
  const { header, siblings, focusedNode } = context;
  const total = siblings.reduce((sum, node) => sum + node.value, 0);

  // Order rows by the chosen measure, largest first, so the tooltip ranks the
  // groups/sub-groups by magnitude regardless of the tree's source-row order.
  const sortedSiblings = [...siblings].sort((a, b) => b.value - a.value);

  const rows: EChartsTooltipRow[] = sortedSiblings.map((node) => {
    const color = getColor(node);
    return {
      isFocused: node === focusedNode,
      markerColorClass: color != null ? getMarkerColorClass(color) : undefined,
      name: node.displayName,
      values: [
        formatValue(node.value),
        formatPercent(total === 0 ? 0 : node.value / total),
      ],
    };
  });

  return {
    header,
    rows,
    footer:
      siblings.length > 1
        ? { name: t`Total`, values: [formatValue(total), formatPercent(1)] }
        : undefined,
  };
}
