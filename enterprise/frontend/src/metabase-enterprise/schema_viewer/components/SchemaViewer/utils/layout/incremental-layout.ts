import type { SchemaViewerFlowNode } from "../../types";

import { buildAdjacency } from "./graph-neighborhood";
import type { PlacementCanvas } from "./placement-canvas";
import { createPlacementCanvas } from "./placement-canvas";
import type { LayoutEdge, NeighborPlacement } from "./types";

/**
 * Merge incoming graph nodes with currently-positioned nodes, preserving the
 * positions of tables that were already on the canvas and placing genuinely
 * new tables next to a connected existing neighbor without overlapping any
 * other node. Returns null if the incoming graph can't be merged
 * incrementally — in which case the caller should
 * fall back to the fresh `incoming` nodes and let the normal Dagre layout
 * path handle them.
 */
export function mergeWithExistingPositions(
  incoming: SchemaViewerFlowNode[],
  current: SchemaViewerFlowNode[],
  edges: LayoutEdge[],
): SchemaViewerFlowNode[] | null {
  if (current.length === 0) {
    return null;
  }

  const currentById = new Map<string, SchemaViewerFlowNode>();
  for (const node of current) {
    currentById.set(node.id, node);
  }

  const incomingIds = new Set<string>();
  for (const node of incoming) {
    incomingIds.add(node.id);
  }

  // If any existing node was removed, this isn't a pure add — fall back.
  // (this shouldn't happen in theory)
  if (current.some((n) => !incomingIds.has(n.id))) {
    return null;
  }

  const canvas = createPlacementCanvas(incoming);
  const newNodes: SchemaViewerFlowNode[] = [];
  for (const node of incoming) {
    const existing = currentById.get(node.id);
    if (existing != null) {
      canvas.preserve(node, existing);
    } else {
      newNodes.push(node);
    }
  }

  if (newNodes.length === 0) {
    return canvas.getPlacedNodesInOrder(incoming);
  }

  const adjacency = buildAdjacency(edges);
  const remaining = placeReachableAdditions(newNodes, adjacency, canvas);

  // If any new node has no reachable neighbor in the current graph - fall back.
  if (remaining.length > 0) {
    return null;
  }

  // Return nodes in the incoming order so edge ordering stays consistent.
  return canvas.getPlacedNodesInOrder(incoming);
}

/**
 * Places nodes whose neighbors are already positioned, iterating until no
 * reachable unplaced nodes remain.
 *
 * Each pass scans the currently unplaced nodes and looks for the first
 * adjacency entry that points to an already placed neighbor. When one is found,
 * the node is positioned next to that neighbor on the preferred side.
 * Nodes without any placed neighbors are carried forward.
 * The loop stops once a full pass cannot place anything, leaving only
 * nodes that are disconnected from the placed component.
 */
function placeReachableAdditions(
  nodes: SchemaViewerFlowNode[],
  adjacency: Map<string, NeighborPlacement[]>,
  canvas: PlacementCanvas,
): SchemaViewerFlowNode[] {
  let remaining = nodes;
  let progressed = true;
  while (remaining.length > 0 && progressed) {
    progressed = false;
    const stillRemaining: SchemaViewerFlowNode[] = [];
    for (const node of remaining) {
      const placement = adjacency
        .get(node.id)
        ?.find(({ neighborId }) => canvas.hasPlaced(neighborId));
      if (placement == null) {
        stillRemaining.push(node);
        continue;
      }
      const neighbor = canvas.getPlaced(placement.neighborId)!;
      canvas.place(
        node,
        canvas.findNearestOpenSlot(node, neighbor, placement.preferredSide),
      );
      progressed = true;
    }
    remaining = stillRemaining;
  }
  return remaining;
}
