import { NODE_WIDTH_PX } from "../../constants";
import type { SchemaViewerFlowNode } from "../../types";

import { DAGRE_NODE_SEP_PX, DAGRE_RANK_SEP_PX } from "./constants";
import {
  applyDagrePositions,
  getDagreLayoutRequest,
  getDagrePositions,
} from "./dagre-layout";
import { partitionFocalNeighbors } from "./graph-neighborhood";
import type { PlacementCanvas } from "./placement-canvas";
import { createPlacementCanvas } from "./placement-canvas";
import type {
  DagreLayoutRequest,
  DagreNodePosition,
  LayoutEdge,
} from "./types";

export type PreparedFocalLayout =
  | { kind: "complete"; nodes: SchemaViewerFlowNode[] }
  | {
      kind: "dagre";
      graph: DagreLayoutRequest;
      complete: (
        positions: readonly DagreNodePosition[],
      ) => SchemaViewerFlowNode[];
    };

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

function placeFocalSideCluster(
  laidOutRest: readonly SchemaViewerFlowNode[],
  focalCenterY: number,
  canvas: PlacementCanvas,
): void {
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
 * Places the focal cluster synchronously and prepares only the remaining side
 * cluster for Dagre. The caller decides whether that Dagre work runs in the
 * worker or through the synchronous fallback.
 */
export function prepareFocusNodeLayout(
  focalId: string,
  nodes: SchemaViewerFlowNode[],
  edges: LayoutEdge[],
): PreparedFocalLayout {
  const canvas = createPlacementCanvas(nodes);
  const focal = canvas.getNode(focalId);
  if (focal == null) {
    return { kind: "complete", nodes };
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

  const restNodes = nodes.filter((node) => !canvas.hasPlaced(node.id));
  if (restNodes.length === 0) {
    return {
      kind: "complete",
      nodes: canvas.getPlacedOrOriginalNodesInOrder(nodes),
    };
  }

  const restIds = new Set(restNodes.map((node) => node.id));
  const restEdges = edges.filter(
    (edge) => restIds.has(edge.source) && restIds.has(edge.target),
  );

  return {
    kind: "dagre",
    graph: getDagreLayoutRequest(restNodes, restEdges),
    complete: (positions) => {
      const laidOutRest = applyDagrePositions(restNodes, positions);
      placeFocalSideCluster(laidOutRest, focalCenterY, canvas);
      return canvas.getPlacedOrOriginalNodesInOrder(nodes);
    },
  };
}

/** Synchronous composition retained for fallback and existing callers. */
export function focusNodeLayout(
  focalId: string,
  nodes: SchemaViewerFlowNode[],
  edges: LayoutEdge[],
): SchemaViewerFlowNode[] {
  const prepared = prepareFocusNodeLayout(focalId, nodes, edges);
  return prepared.kind === "complete"
    ? prepared.nodes
    : prepared.complete(getDagrePositions(prepared.graph));
}
