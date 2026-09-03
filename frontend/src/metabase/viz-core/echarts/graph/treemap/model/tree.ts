import type { EChartsType } from "echarts/core";
import type { TreeNode } from "echarts/types/src/data/Tree";
import type GlobalModel from "echarts/types/src/model/Global";

import type {
  NodeId,
  TreemapLayoutNode,
  TreemapNode,
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
  // @ts-expect-error -- getModel is private in ECharts' public types
  const globalModel: GlobalModel = chart.getModel();

  return globalModel?.getSeriesByIndex(0)?.getRawData()?.tree?.root;
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
  return getNodesFromPath(tree, id)?.at(-1);
}

const NODE_ID_SEP = "-";

export function getTreemapNodeId(
  rootIndex: number,
  leafIndex?: number,
): string {
  return leafIndex == null
    ? `${rootIndex}`
    : `${rootIndex}${NODE_ID_SEP}${leafIndex}`;
}

export function getTreemapRootNodeId(id: NodeId): NodeId {
  return id.split(NODE_ID_SEP)[0];
}

/** Whether the chart shows the top-level overview rather than a drilled-in group. */
export function isOverview(viewRootId: NodeId | null): boolean {
  return viewRootId == null;
}

export function parseTreemapNodeId(id: NodeId): {
  rootIndex: number;
  leafIndex?: number;
} {
  const [root, leaf] = id.split(NODE_ID_SEP);
  return {
    rootIndex: Number(root),
    leafIndex: leaf == null ? undefined : Number(leaf),
  };
}

export function hasChildren(
  node: TreemapNode,
): node is TreemapNode & { children: NonNullable<TreemapNode["children"]> } {
  return node.children != null;
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

/**
 * `"0"` → `[tree[0]]`, `"0-1"` → `[tree[0], tree[0].children[1]]`
 */
export function getNodesFromPath(
  tree: TreemapTree,
  id: NodeId,
): TreemapNode[] | null {
  const path: TreemapNode[] = [];
  let nodes: TreemapTree | undefined = tree;
  for (const segment of id.split(NODE_ID_SEP)) {
    const index = Number(segment);
    const node: TreemapNode | undefined = Number.isInteger(index)
      ? nodes?.[index]
      : undefined;
    if (node == null) {
      return null;
    }
    path.push(node);
    nodes = node.children;
  }
  return path;
}

/** The nodes on the same level as `id` */
export function getSiblings(
  tree: TreemapTree,
  id: NodeId,
): TreemapTree | undefined {
  const { rootIndex, leafIndex } = parseTreemapNodeId(id);
  return leafIndex == null ? tree : tree[rootIndex]?.children;
}
