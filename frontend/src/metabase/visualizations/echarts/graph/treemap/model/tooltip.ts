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
  groupingHeader?: string,
): TreemapTooltipContext | null {
  const [rootPart, leafPart] = id.split("-");
  const root = tree[Number(rootPart)];
  if (root == null) {
    return null;
  }

  if (leafPart == null) {
    return { header: groupingHeader, siblings: tree, focusedNode: root };
  }

  const siblings = root.children;
  const focusedNode = siblings?.[Number(leafPart)];
  if (siblings == null || focusedNode == null) {
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

  const rows: EChartsTooltipRow[] = siblings.map((node) => {
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
