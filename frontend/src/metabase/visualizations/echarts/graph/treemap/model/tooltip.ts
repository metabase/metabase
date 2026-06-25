import { t } from "ttag";

import type {
  EChartsTooltipModel,
  EChartsTooltipRow,
} from "metabase/visualizations/components/ChartTooltip/EChartsTooltip";
import { getMarkerColorClass } from "metabase/visualizations/echarts/tooltip";

import type { ParentLabelLayout, TreemapLabelLayout } from "./labels";
import { getSiblings, isOverview, parseTreemapNodeId } from "./tree";
import type {
  ChartPointer,
  TreemapNode,
  TreemapRect,
  TreemapTree,
} from "./types";
import { getTreemapTotal } from "./value";

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
  if (isGroupHeaderNode(id, viewRootId, isTwoLevel)) {
    return valuePercentHeaderIds.has(id);
  }
  return fullLeafIds.has(id);
}

export function getTreemapTooltipContext(
  tree: TreemapTree,
  id: string,
  viewRootId: string | null,
  groupingHeader?: string,
): TreemapTooltipContext | null {
  const { rootIndex, leafIndex } = parseTreemapNodeId(id);

  if (isOverview(viewRootId)) {
    const isHeader = leafIndex == null;
    if (isHeader) {
      const focusedNode = tree[rootIndex];
      if (focusedNode == null) {
        return null;
      }
      return { header: groupingHeader, siblings: tree, focusedNode };
    }

    const parent = tree[rootIndex];
    const siblings = getSiblings(tree, id);
    const focusedNode = siblings?.[leafIndex];
    if (parent == null || siblings == null || focusedNode == null) {
      return null;
    }
    return {
      header: parent.displayName,
      siblings,
      focusedNode,
      parentNode: parent,
    };
  }

  const root = tree[Number(viewRootId)];
  const siblings = getSiblings(tree, id);
  const focusedNode = siblings?.[leafIndex ?? -1];
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
  formatPercent: (ratio: number) => string,
): EChartsTooltipModel {
  const { header, siblings, focusedNode } = context;
  const total = getTreemapTotal(siblings);

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

export function isGroupHeaderNode(
  id: string,
  viewRootId: string | null,
  isTwoLevel: boolean,
): boolean {
  const { leafIndex } = parseTreemapNodeId(id);
  return isOverview(viewRootId) && isTwoLevel && leafIndex == null;
}

export function isPointerBelowGroupHeader(
  rect: TreemapRect,
  pointer: ChartPointer,
  headerHeight: number,
): boolean {
  return pointer.y > rect.y + headerHeight;
}
