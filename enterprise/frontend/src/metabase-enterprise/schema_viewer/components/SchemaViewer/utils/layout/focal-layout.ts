import { NODE_WIDTH_PX } from "../../constants";
import type { SchemaViewerFlowNode } from "../../types";

import { DAGRE_NODE_SEP_PX, DAGRE_RANK_SEP_PX } from "./constants";
import { layoutWithDagre } from "./dagre-layout";
import { partitionFocalNeighbors } from "./graph-neighborhood";
import type { PlacementCanvas } from "./placement-canvas";
import { createPlacementCanvas } from "./placement-canvas";
import type { LayoutEdge } from "./types";

/**
 * Stacks direct focal neighbors vertically in a single column centered on the
 * focal node, preserving the neighbor iteration order.
 */
function placeFocalNeighborColumn(
  neighborIds: Set<string>,
  x: number,
  focalCenterY: number,
  canvas: PlacementCanvas,
): void {
  const neighbors: { node: SchemaViewerFlowNode; height: number }[] = [];
  let totalHeight = 0;
  for (const id of neighborIds) {
    const node = canvas.getNode(id);
    if (node != null) {
      const height = canvas.getDimensions(node).height;
      neighbors.push({ node, height });
      totalHeight += height;
    }
  }
  if (neighbors.length === 0) {
    return;
  }
  totalHeight += DAGRE_NODE_SEP_PX * (neighbors.length - 1);
  let cursorY = focalCenterY - totalHeight / 2;
  for (const { node, height } of neighbors) {
    canvas.place(node, { x, y: cursorY });
    cursorY += height + DAGRE_NODE_SEP_PX;
  }
}

/**
 * Lays out everything that isn't part of the focal cluster (indirect nodes +
 * fully disconnected ones) with Dagre as an independent side cluster, then
 * translates the cluster one extra rank-gap to the right of the already-placed
 * focal content and vertically centers it on the focal node. Cross-cluster
 * edges (focal-cluster ↔ side-cluster) are intentionally excluded from the
 * side Dagre call so the side cluster's internal shape is driven by its own
 * connectivity, not pulled toward the already-placed focal cluster.
 */
function placeFocalSideCluster(
  restNodes: SchemaViewerFlowNode[],
  edges: LayoutEdge[],
  focalCenterY: number,
  canvas: PlacementCanvas,
): void {
  if (restNodes.length === 0) {
    return;
  }
  const restIds = new Set<string>();
  for (const node of restNodes) {
    restIds.add(node.id);
  }
  const restEdges = edges.filter(
    (e) => restIds.has(e.source) && restIds.has(e.target),
  );
  const laidOutRest = layoutWithDagre(restNodes, restEdges);

  let restMinX = Infinity;
  let restMinY = Infinity;
  let restMaxY = -Infinity;
  for (const node of laidOutRest) {
    const { height } = canvas.getDimensions(node);
    if (node.position.x < restMinX) {
      restMinX = node.position.x;
    }
    if (node.position.y < restMinY) {
      restMinY = node.position.y;
    }
    if (node.position.y + height > restMaxY) {
      restMaxY = node.position.y + height;
    }
  }

  const dx = canvas.rightEdge + DAGRE_RANK_SEP_PX * 2 - restMinX;
  const dy = focalCenterY - (restMinY + restMaxY) / 2;

  for (const node of laidOutRest) {
    canvas.place(node, {
      x: node.position.x + dx,
      y: node.position.y + dy,
    });
  }
}

/**
 * Re-layouts the graph around a focal node without moving the focal node
 * itself, so the user's camera position remains meaningful. Direct incoming
 * neighbors are stacked in a centered column on the left, direct outgoing
 * neighbors are stacked on the right.
 * Everything outside that focal cluster is laid out with Dagre as
 * an independent side cluster.
 */
export function focusNodeLayout(
  focalId: string,
  nodes: SchemaViewerFlowNode[],
  edges: LayoutEdge[],
): SchemaViewerFlowNode[] {
  const canvas = createPlacementCanvas(nodes);
  const focal = canvas.getNode(focalId);
  if (focal == null) {
    return nodes;
  }

  canvas.place(focal, focal.position);
  const { width: focalWidth, height: focalHeight } =
    canvas.getDimensions(focal);
  const focalCenterY = focal.position.y + focalHeight / 2;

  const { incomingIds, outgoingIds } = partitionFocalNeighbors(focalId, edges);
  placeFocalNeighborColumn(
    incomingIds,
    focal.position.x - NODE_WIDTH_PX - DAGRE_RANK_SEP_PX,
    focalCenterY,
    canvas,
  );
  placeFocalNeighborColumn(
    outgoingIds,
    focal.position.x + focalWidth + DAGRE_RANK_SEP_PX,
    focalCenterY,
    canvas,
  );

  const restNodes = nodes.filter((n) => !canvas.hasPlaced(n.id));
  placeFocalSideCluster(restNodes, edges, focalCenterY, canvas);

  return canvas.getPlacedOrOriginalNodesInOrder(nodes);
}
