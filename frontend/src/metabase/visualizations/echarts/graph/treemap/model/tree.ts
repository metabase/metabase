import type { EChartsType } from "echarts/core";

import type {
  NodeId,
  TreemapLayoutNode,
  TreemapRect,
  TreemapTree,
} from "./types";

// Minimal shape of ECharts' internal treemap tree node. ECharts' public types
// don't surface the laid-out tree, so we narrow to the fields we read.
interface EChartsTreeNode {
  getId(): string;
  children?: EChartsTreeNode[];
  getLayout():
    | { x?: number; y?: number; width?: number; height?: number }
    | undefined;
  eachNode(cb: (node: EChartsTreeNode) => void): void;
}

/**
 * The treemap's laid-out tree (with per-node pixel layout) lives on the raw
 * series data (`.tree.root`), which ECharts' public types don't expose — hence
 * the narrow cast. Returns `undefined` before the first layout.
 */
function getTreemapRoot(chart: EChartsType): EChartsTreeNode | undefined {
  return (
    chart as unknown as {
      getModel(): {
        getSeriesByIndex(i: number): {
          getRawData(): { tree?: { root?: EChartsTreeNode } };
        } | null;
      };
    }
  )
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
    const layout = node.getLayout();
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
    const layout = node.getLayout();
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
