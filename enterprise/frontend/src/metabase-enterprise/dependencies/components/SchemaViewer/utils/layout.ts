import dagre from "@dagrejs/dagre";

import {
  DAGRE_NODE_SEP,
  DAGRE_RANK_SEP,
  HEADER_HEIGHT,
  NODE_WIDTH,
} from "../constants";
import type { SchemaViewerFlowNode } from "../types";

import { nodeHeight } from "./flow-graph";

// Minimum visual gap to leave between a newly-placed node and any existing one
const COLLISION_PADDING = 20;
// Vertical step used when walking to find a free slot for an incoming node
const COLLISION_Y_STEP = 100;
// Maximum number of Y steps to try before giving up on a given column
const MAX_COLLISION_Y_STEPS = 40;

type NodeDimensions = {
  width: number;
  height: number;
};

type NeighborPlacement = {
  neighborId: string;
  prefersRight: boolean;
};

type OccupiedBox = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type PlacementState = {
  columnsByX: Map<number, OccupiedBox[]>;
  dimensionsById: Map<string, NodeDimensions>;
  maxRight: number;
};

export function getNodesWithPositions(
  nodes: SchemaViewerFlowNode[],
  edges: { source: string; target: string }[],
): SchemaViewerFlowNode[] {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setGraph({
    rankdir: "LR",
    nodesep: DAGRE_NODE_SEP,
    ranksep: DAGRE_RANK_SEP,
  });
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: NODE_WIDTH,
      height: nodeHeight(node.data.fields?.length ?? 0),
    });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  return nodes.map((node) => {
    const { x, y, width, height } = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: x - width / 2,
        y: y - height / 2,
      },
      // Sync dimensions with React Flow's internal state
      style: {
        ...node.style,
        width,
        height,
        opacity: 1, // Show after positioning
      },
    };
  });
}

/**
 * Merge incoming graph nodes with currently-positioned nodes, preserving the
 * positions of tables that were already on the canvas and placing genuinely
 * new tables next to a connected existing neighbor without overlapping any
 * other node. Returns null if the incoming graph can't be merged
 * incrementally (first load, schema switch, node removal, or an isolated
 * new node with no connected neighbor) — in which case the caller should
 * fall back to the fresh `incoming` nodes and let the normal Dagre layout
 * path handle them.
 */
export function mergeWithExistingPositions(
  incoming: SchemaViewerFlowNode[],
  current: SchemaViewerFlowNode[],
  edges: { source: string; target: string }[],
): SchemaViewerFlowNode[] | null {
  // No existing state → nothing to preserve, fresh layout handles it.
  if (current.length === 0) {
    return null;
  }

  const currentById = new Map(current.map((n) => [n.id, n]));
  const incomingIds = new Set(incoming.map((n) => n.id));

  // If any existing node was removed, this isn't a pure add — fall back.
  if (current.some((n) => !incomingIds.has(n.id))) {
    return null;
  }

  // Track which IDs are already positioned (existing tables, plus any new
  // tables that have been placed in the iteration below).
  const placedById = new Map<string, SchemaViewerFlowNode>();
  const placementState = createPlacementState(incoming);
  for (const node of incoming) {
    const existing = currentById.get(node.id);
    if (existing != null) {
      // Preserve position and style (keeps opacity: 1, measured width/height).
      const positionedNode = {
        ...node,
        position: existing.position,
        style: existing.style,
      };
      placedById.set(node.id, positionedNode);
      registerPlacedNode(positionedNode, placementState);
    }
  }

  // Remaining = new tables still to position.
  const adjacency = buildAdjacency(edges);
  const remaining = placeNodesByAdjacency(
    incoming.filter((n) => !currentById.has(n.id)),
    placedById,
    adjacency,
    placementState,
  );

  // If any new node has no reachable neighbor in the current graph,
  // give up and let Dagre handle it.
  if (remaining.length > 0) {
    return null;
  }

  // Return nodes in the incoming order so edge ordering stays stable.
  return incoming.map((n) => placedById.get(n.id)!);
}

/**
 * Find a position for a new node next to a connected neighbor such that the
 * resulting bounding box doesn't overlap any already-placed node. Strategy:
 * walk outward from the neighbor's (x, y), preferring positions that are
 * close to the neighbor — interleaving the "preferred" side (the Dagre
 * rankdir convention) with the "alternate" side at each Y step so that
 * same-row placement on either side wins over a far-away Y on the preferred
 * column. Falls back to a fresh column to the right of all existing
 * content if nothing fits within the search window.
 */
function findNonCollidingPosition(
  newNode: SchemaViewerFlowNode,
  neighbor: SchemaViewerFlowNode,
  prefersRight: boolean,
  placementState: PlacementState,
): { x: number; y: number } {
  const { width, height } = getNodeDimensions(
    newNode,
    placementState.dimensionsById,
  );
  const { width: neighborWidth } = getNodeDimensions(
    neighbor,
    placementState.dimensionsById,
  );
  const preferredX = prefersRight
    ? neighbor.position.x + neighborWidth + DAGRE_RANK_SEP
    : neighbor.position.x - width - DAGRE_RANK_SEP;
  const alternateX = prefersRight
    ? neighbor.position.x - width - DAGRE_RANK_SEP
    : neighbor.position.x + neighborWidth + DAGRE_RANK_SEP;
  const baseY = neighbor.position.y;

  const fits = (x: number, y: number) =>
    !collidesWithAny(x, y, width, height, placementState.columnsByX);

  // Try increasing Y offsets, checking both columns at each step. Within a
  // given Y step, preferred side is checked before alternate. For i > 0 we
  // try the +Y direction before the -Y direction (downward bias matches the
  // Dagre layout's tendency to grow downward on relayouts).
  for (let i = 0; i <= MAX_COLLISION_Y_STEPS; i++) {
    if (i === 0) {
      if (fits(preferredX, baseY)) {
        return { x: preferredX, y: baseY };
      }
      if (fits(alternateX, baseY)) {
        return { x: alternateX, y: baseY };
      }
      continue;
    }
    const dy = i * COLLISION_Y_STEP;
    if (fits(preferredX, baseY + dy)) {
      return { x: preferredX, y: baseY + dy };
    }
    if (fits(alternateX, baseY + dy)) {
      return { x: alternateX, y: baseY + dy };
    }
    if (fits(preferredX, baseY - dy)) {
      return { x: preferredX, y: baseY - dy };
    }
    if (fits(alternateX, baseY - dy)) {
      return { x: alternateX, y: baseY - dy };
    }
  }

  // Last resort: fresh column to the right of everything.
  return { x: placementState.maxRight + DAGRE_RANK_SEP, y: baseY };
}

function collidesWithAny(
  x: number,
  y: number,
  width: number,
  height: number,
  columnsByX: Map<number, OccupiedBox[]>,
): boolean {
  const left = x;
  const right = x + width;
  const top = y;
  const bottom = y + height;

  for (const [columnX, boxes] of columnsByX) {
    if (
      left >= columnX + NODE_WIDTH + COLLISION_PADDING ||
      right + COLLISION_PADDING <= columnX
    ) {
      continue;
    }
    for (const box of boxes) {
      if (
        left < box.right + COLLISION_PADDING &&
        right + COLLISION_PADDING > box.left &&
        top < box.bottom + COLLISION_PADDING &&
        bottom + COLLISION_PADDING > box.top
      ) {
        return true;
      }
    }
  }
  return false;
}

function getStyleDimension(
  node: SchemaViewerFlowNode,
  key: "width" | "height",
): number | null {
  const value = node.style?.[key];
  return typeof value === "number" ? value : null;
}

function getNodeDimensions(
  node: SchemaViewerFlowNode,
  dimensionsById?: Map<string, NodeDimensions>,
): NodeDimensions {
  return (
    dimensionsById?.get(node.id) ?? {
      width: getStyleDimension(node, "width") ?? NODE_WIDTH,
      height: getStyleDimension(node, "height") ?? HEADER_HEIGHT,
    }
  );
}

function createPlacementState(
  nodes: SchemaViewerFlowNode[],
  placedById?: Map<string, SchemaViewerFlowNode>,
): PlacementState {
  const dimensionsById = new Map(
    nodes.map((node) => [node.id, getNodeDimensions(node)]),
  );
  const state: PlacementState = {
    columnsByX: new Map(),
    dimensionsById,
    maxRight: 0,
  };
  if (placedById != null) {
    for (const node of placedById.values()) {
      registerPlacedNode(node, state);
    }
  }
  return state;
}

function registerPlacedNode(
  node: SchemaViewerFlowNode,
  placementState: PlacementState,
): void {
  const { width, height } = getNodeDimensions(
    node,
    placementState.dimensionsById,
  );
  const x = node.position.x;
  const y = node.position.y;
  const boxes = placementState.columnsByX.get(x);
  const occupied: OccupiedBox = {
    left: x,
    right: x + width,
    top: y,
    bottom: y + height,
  };
  if (boxes == null) {
    placementState.columnsByX.set(x, [occupied]);
  } else {
    boxes.push(occupied);
  }
  placementState.maxRight = Math.max(placementState.maxRight, occupied.right);
}

function buildAdjacency(
  edges: { source: string; target: string }[],
): Map<string, NeighborPlacement[]> {
  const adjacency = new Map<string, NeighborPlacement[]>();
  for (const edge of edges) {
    const sourceNeighbors = adjacency.get(edge.source);
    const targetNeighbors = adjacency.get(edge.target);
    const sourcePlacement = {
      neighborId: edge.target,
      prefersRight: false,
    };
    const targetPlacement = {
      neighborId: edge.source,
      prefersRight: true,
    };
    if (sourceNeighbors == null) {
      adjacency.set(edge.source, [sourcePlacement]);
    } else {
      sourceNeighbors.push(sourcePlacement);
    }
    if (targetNeighbors == null) {
      adjacency.set(edge.target, [targetPlacement]);
    } else {
      targetNeighbors.push(targetPlacement);
    }
  }
  return adjacency;
}

function placeNodesByAdjacency(
  nodes: SchemaViewerFlowNode[],
  placedById: Map<string, SchemaViewerFlowNode>,
  adjacency: Map<string, NeighborPlacement[]>,
  placementState: PlacementState,
): SchemaViewerFlowNode[] {
  let remaining = nodes;
  let progressed = true;
  while (remaining.length > 0 && progressed) {
    progressed = false;
    const stillRemaining: SchemaViewerFlowNode[] = [];
    for (const node of remaining) {
      const placement = adjacency
        .get(node.id)
        ?.find(({ neighborId }) => placedById.has(neighborId));
      if (placement == null) {
        stillRemaining.push(node);
        continue;
      }
      const neighbor = placedById.get(placement.neighborId)!;
      const positionedNode = {
        ...node,
        position: findNonCollidingPosition(
          node,
          neighbor,
          placement.prefersRight,
          placementState,
        ),
        style: {
          ...node.style,
          opacity: 1,
        },
      };
      placedById.set(node.id, positionedNode);
      registerPlacedNode(positionedNode, placementState);
      progressed = true;
    }
    remaining = stillRemaining;
  }
  return remaining;
}

/**
 * Re-layout the graph centered on the focal node: incoming edges end up on
 * the left, outgoing on the right, remaining nodes get placed next to a
 * connected neighbor using the same non-colliding placement rules that
 * {@link mergeWithExistingPositions} uses for FK expansion. The focal node
 * stays put so the user's camera position remains meaningful.
 */
export function focusNodeLayout(
  focalId: string,
  nodes: SchemaViewerFlowNode[],
  edges: { source: string; target: string }[],
): SchemaViewerFlowNode[] {
  const focal = nodes.find((n) => n.id === focalId);
  if (focal == null) {
    return nodes;
  }

  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  const placedById = new Map<string, SchemaViewerFlowNode>();
  placedById.set(focalId, {
    ...focal,
    style: { ...focal.style, opacity: 1 },
  });
  const placementState = createPlacementState(nodes, placedById);
  const { width: focalWidth, height: focalHeight } = getNodeDimensions(
    focal,
    placementState.dimensionsById,
  );
  const focalCenterY = focal.position.y + focalHeight / 2;

  // Partition neighbors by edge direction (self-refs are ignored).
  const incomingIds = new Set<string>();
  const outgoingIds = new Set<string>();
  for (const edge of edges) {
    if (edge.source === focalId && edge.target !== focalId) {
      outgoingIds.add(edge.target);
    } else if (edge.target === focalId && edge.source !== focalId) {
      incomingIds.add(edge.source);
    }
  }

  // Drop each row onto a single column that's vertically centered on the
  // focal node. A small additional gap below COLLISION_PADDING keeps rows
  // from touching.
  const columnGap = DAGRE_NODE_SEP;

  const placeColumn = (neighborIds: Set<string>, x: number) => {
    const neighbors = [...neighborIds]
      .map((id) => nodesById.get(id))
      .filter((n): n is SchemaViewerFlowNode => n != null);
    if (neighbors.length === 0) {
      return;
    }
    const heights = neighbors.map(
      (n) => getNodeDimensions(n, placementState.dimensionsById).height,
    );
    const totalHeight =
      heights.reduce((sum, h) => sum + h, 0) +
      columnGap * (neighbors.length - 1);
    let cursorY = focalCenterY - totalHeight / 2;
    for (let i = 0; i < neighbors.length; i++) {
      const node = neighbors[i];
      const positionedNode = {
        ...node,
        position: { x, y: cursorY },
        style: { ...node.style, opacity: 1 },
      };
      placedById.set(node.id, positionedNode);
      registerPlacedNode(positionedNode, placementState);
      cursorY += heights[i] + columnGap;
    }
  };

  placeColumn(incomingIds, focal.position.x - NODE_WIDTH - DAGRE_RANK_SEP);
  placeColumn(outgoingIds, focal.position.x + focalWidth + DAGRE_RANK_SEP);

  // Anything not directly connected to the focal node: place it next to a
  // neighbor that's already positioned. Iterate in passes — just like the
  // FK-expansion merge path — so chains keep growing outward.
  const adjacency = buildAdjacency(edges);
  const remaining = placeNodesByAdjacency(
    nodes.filter((n) => !placedById.has(n.id)),
    placedById,
    adjacency,
    placementState,
  );

  // Fully disconnected leftovers: drop them in a fresh column to the right
  // of everything that's already placed, stacked top-down. This keeps them
  // out of the focal layout while still making them reachable via pan.
  if (remaining.length > 0) {
    let cursorY = focal.position.y;
    for (const node of remaining) {
      const { height } = getNodeDimensions(node, placementState.dimensionsById);
      const positionedNode = {
        ...node,
        position: { x: placementState.maxRight + DAGRE_RANK_SEP, y: cursorY },
        style: { ...node.style, opacity: 1 },
      };
      placedById.set(node.id, positionedNode);
      registerPlacedNode(positionedNode, placementState);
      cursorY += height + columnGap;
    }
  }

  // Preserve original node order.
  return nodes.map((n) => placedById.get(n.id) ?? n);
}
