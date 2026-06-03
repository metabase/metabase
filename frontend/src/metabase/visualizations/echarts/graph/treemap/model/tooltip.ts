import { t } from "ttag";

import { formatPercent } from "metabase/static-viz/lib/numbers";
import type {
  EChartsTooltipModel,
  EChartsTooltipRow,
} from "metabase/visualizations/components/ChartTooltip/EChartsTooltip";
import { getMarkerColorClass } from "metabase/visualizations/echarts/tooltip";

import type { TreemapNode, TreemapTree } from "./types";

export interface TreemapTooltipContext {
  header?: string;
  siblings: TreemapTree;
  focusedNode: TreemapNode;
  // Present for leaf-level tooltips: siblings share the parent's color.
  parentNode?: TreemapNode;
}

export function getTreemapNodeId(
  rootIndex: number,
  leafIndex?: number,
): string {
  return leafIndex == null ? `${rootIndex}` : `${rootIndex}-${leafIndex}`;
}

export function getTreemapTooltipContext(
  tree: TreemapTree,
  id: string,
  viewRootId: string | null,
  groupingHeader?: string,
): TreemapTooltipContext | null {
  const [rootPart, leafPart] = id.split("-");

  // Overview (not drilled in): every element — top-level box or sub-group box —
  // shows the top-level summary, highlighting the hovered element's top-level
  // group. The leaf segment of `id` is intentionally ignored here.
  if (viewRootId == null) {
    const focusedNode = tree[Number(rootPart)];
    if (focusedNode == null) {
      return null;
    }
    return { header: groupingHeader, siblings: tree, focusedNode };
  }

  // Drilled into a top-level group: show that group's sub-group breakdown,
  // highlighting the hovered sub-group.
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
