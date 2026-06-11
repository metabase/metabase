import type { EChartsType } from "echarts/core";
import type { TreeNode } from "echarts/types/src/data/Tree";
import type GlobalModel from "echarts/types/src/model/Global";

import type {
  NodeId,
  TreemapLayoutNode,
  TreemapRect,
  TreemapTree,
} from "./types";

// `TreeNode.getLayout()` is typed `any` by ECharts; narrow to the fields we read.
type TreeNodeLayout =
  | { x?: number; y?: number; width?: number; height?: number }
  | undefined;

/**
 * The treemap's laid-out tree (with per-node pixel layout) lives on the raw
 * series data (`.tree.root`). `getModel()` is declared `private` in ECharts'.
 */
function getTreemapRoot(chart: EChartsType): TreeNode | undefined {
  return (chart as unknown as { getModel(): GlobalModel })
    .getModel()
    ?.getSeriesByIndex(0)
    ?.getRawData()?.tree?.root;
}

/**
 * The rendered pixel rectangle of the tile with the given path-encoded id (the
 * ids set in `option.ts`: "0", "0-1"), or `null` if the node isn't laid out yet
 * or has no usable rect. Used to position the hover overlay over a whole
 * section (see `TreemapChart/events.ts`).
 */
export function getTreemapNodeRectById(
  chart: EChartsType,
  id: string,
): TreemapRect | null {
  const root = getTreemapRoot(chart);
  if (!root) {
    return null;
  }

  let rect: TreemapRect | null = null;
  root.eachNode((node) => {
    if (rect != null || node.getId() !== id) {
      return;
    }
    const layout: TreeNodeLayout = node.getLayout();
    if (
      layout?.width == null ||
      layout?.height == null ||
      layout.x == null ||
      layout.y == null
    ) {
      return;
    }
    rect = {
      x: layout.x,
      y: layout.y,
      width: layout.width,
      height: layout.height,
    };
  });
  return rect;
}

export function getNode(id: NodeId, tree: TreemapTree) {
  const [rootPart, leafPart] = id.split("-");
  const root = tree[Number(rootPart)];
  return leafPart == null ? root : root?.children?.[Number(leafPart)];
}

/**
 * Pull the laid-out treemap tiles off an ECharts instance. Off-screen or
 * zero-area nodes (no usable layout) are skipped.
 */
export function getTreemapLayoutNodes(chart: EChartsType): TreemapLayoutNode[] {
  const root = getTreemapRoot(chart);

  if (!root) {
    return [];
  }

  const nodes: TreemapLayoutNode[] = [];
  root.eachNode((node) => {
    const layout: TreeNodeLayout = node.getLayout();
    if (!layout?.width || !layout?.height) {
      return;
    }
    nodes.push({
      id: node.getId(),
      rect: { width: layout.width, height: layout.height },
      isLeaf: node.children == null || node.children.length === 0,
    });
  });
  return nodes;
}
