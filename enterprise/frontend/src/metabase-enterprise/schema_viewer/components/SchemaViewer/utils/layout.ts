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

type OccupiedColumn = {
  left: number;
  right: number;
  boxes: OccupiedBox[];
};

type PlacementState = {
  columns: OccupiedColumn[];
  columnsByX: Map<number, OccupiedColumn>;
  dimensionsById: Map<string, NodeDimensions>;
  maxRight: number;
  maxColumnWidth: number;
};

/**
 * Runs a full Dagre pass and converts center-based Dagre coordinates into
 * React Flow's top-left node positions.
 */
function getNodesWithPositions(
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
function mergeWithExistingPositions(
  incoming: SchemaViewerFlowNode[],
  current: SchemaViewerFlowNode[],
  edges: { source: string; target: string }[],
): SchemaViewerFlowNode[] | null {
  // No existing state → nothing to preserve, fresh layout handles it.
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
  if (current.some((n) => !incomingIds.has(n.id))) {
    return null;
  }

  // Track which IDs are already positioned (existing tables, plus any new
  // tables that have been placed in the iteration below).
  const placedById = new Map<string, SchemaViewerFlowNode>();
  const placementState = createPlacementState(incoming);
  const newNodes: SchemaViewerFlowNode[] = [];
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
    } else {
      newNodes.push(node);
    }
  }

  if (newNodes.length === 0) {
    return incoming.map((n) => placedById.get(n.id)!);
  }

  // Remaining = new tables still to position.
  const adjacency = buildAdjacency(edges);
  const remaining = placeNodesByAdjacency(
    newNodes,
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
    !collidesWithAny(x, y, width, height, placementState);

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

/**
 * Tests a candidate box against nearby occupied columns, using the sorted
 * column index to skip boxes that cannot overlap horizontally.
 */
function collidesWithAny(
  x: number,
  y: number,
  width: number,
  height: number,
  placementState: PlacementState,
): boolean {
  const left = x;
  const right = x + width;
  const top = y;
  const bottom = y + height;
  const { columns, maxColumnWidth } = placementState;
  const firstColumn = getFirstColumnAtOrAfter(
    columns,
    left - maxColumnWidth - COLLISION_PADDING,
  );

  for (let i = firstColumn; i < columns.length; i++) {
    const column = columns[i];
    if (column.left >= right + COLLISION_PADDING) {
      break;
    }
    if (left >= column.right + COLLISION_PADDING) {
      continue;
    }
    for (const box of column.boxes) {
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

/**
 * Reads numeric dimensions that React Flow stores on node style; ignores
 * non-numeric style values so callers can safely fall back.
 */
function getStyleDimension(
  node: SchemaViewerFlowNode,
  key: "width" | "height",
): number | null {
  const value = node.style?.[key];
  return typeof value === "number" ? value : null;
}

/**
 * Resolves dimensions from the placement cache first, falling back to style
 * dimensions and then default table-card dimensions.
 */
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

/**
 * Builds the shared mutable placement index used while laying out nodes,
 * precomputing node dimensions and optionally seeding existing boxes.
 */
function createPlacementState(
  nodes: SchemaViewerFlowNode[],
  placedById?: Map<string, SchemaViewerFlowNode>,
): PlacementState {
  const dimensionsById = new Map<string, NodeDimensions>();
  for (const node of nodes) {
    dimensionsById.set(node.id, getNodeDimensions(node));
  }
  const state: PlacementState = {
    columns: [],
    columnsByX: new Map(),
    dimensionsById,
    maxRight: 0,
    maxColumnWidth: 0,
  };
  if (placedById != null) {
    for (const node of placedById.values()) {
      registerPlacedNode(node, state);
    }
  }
  return state;
}

/**
 * Adds a positioned node to the collision index, keeping per-X lookup fast
 * and the sorted column list ready for binary-search scans.
 */
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
  const occupied: OccupiedBox = {
    left: x,
    right: x + width,
    top: y,
    bottom: y + height,
  };
  const column = placementState.columnsByX.get(x);
  if (column == null) {
    const newColumn = {
      left: occupied.left,
      right: occupied.right,
      boxes: [occupied],
    };
    placementState.columnsByX.set(x, newColumn);
    insertColumn(newColumn, placementState.columns);
  } else {
    column.right = Math.max(column.right, occupied.right);
    column.boxes.push(occupied);
  }
  placementState.maxRight = Math.max(placementState.maxRight, occupied.right);
  placementState.maxColumnWidth = Math.max(
    placementState.maxColumnWidth,
    width,
  );
}

/**
 * Inserts a new occupied column into sorted order, using an append fast path
 * for the common left-to-right layout case.
 */
function insertColumn(column: OccupiedColumn, columns: OccupiedColumn[]): void {
  const lastColumn = columns[columns.length - 1];
  if (lastColumn == null || lastColumn.left <= column.left) {
    columns.push(column);
    return;
  }

  columns.splice(getFirstColumnAtOrAfter(columns, column.left), 0, column);
}

/**
 * Finds the first column whose left edge is at or after a target X using a
 * lower-bound binary search.
 */
function getFirstColumnAtOrAfter(
  columns: OccupiedColumn[],
  minLeft: number,
): number {
  let low = 0;
  let high = columns.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (columns[mid].left < minLeft) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

/**
 * Creates bidirectional neighbor lookup for incremental placement, preserving
 * edge direction as a preferred left/right placement hint.
 */
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

/**
 * Places nodes whose neighbors are already positioned, iterating until no
 * reachable unplaced nodes remain.
 */
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
function focusNodeLayout(
  focalId: string,
  nodes: SchemaViewerFlowNode[],
  edges: { source: string; target: string }[],
): SchemaViewerFlowNode[] {
  const nodesById = new Map<string, SchemaViewerFlowNode>();
  let focal: SchemaViewerFlowNode | undefined;
  for (const node of nodes) {
    nodesById.set(node.id, node);
    if (node.id === focalId) {
      focal = node;
    }
  }
  if (focal == null) {
    return nodes;
  }

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

  /**
   * Places direct focal neighbors into one vertical stack centered on the
   * focal node, preserving the neighbor iteration order.
   */
  const placeColumn = (neighborIds: Set<string>, x: number) => {
    const neighbors: { node: SchemaViewerFlowNode; height: number }[] = [];
    let totalHeight = 0;
    for (const id of neighborIds) {
      const node = nodesById.get(id);
      if (node != null) {
        const height = getNodeDimensions(
          node,
          placementState.dimensionsById,
        ).height;
        neighbors.push({ node, height });
        totalHeight += height;
      }
    }
    if (neighbors.length === 0) {
      return;
    }
    totalHeight += columnGap * (neighbors.length - 1);
    let cursorY = focalCenterY - totalHeight / 2;
    for (const { node, height } of neighbors) {
      const positionedNode = {
        ...node,
        position: { x, y: cursorY },
        style: { ...node.style, opacity: 1 },
      };
      placedById.set(node.id, positionedNode);
      registerPlacedNode(positionedNode, placementState);
      cursorY += height + columnGap;
    }
  };

  placeColumn(incomingIds, focal.position.x - NODE_WIDTH - DAGRE_RANK_SEP);
  placeColumn(outgoingIds, focal.position.x + focalWidth + DAGRE_RANK_SEP);

  // Everything not in the focal cluster (indirect nodes + fully disconnected
  // ones) is laid out as a separate Dagre subgraph and dropped to the right
  // of the focal cluster. This keeps the side cluster dense and rectangular
  // instead of stretching into a long collision-walk chain when the rest of
  // the schema is large. Cross-cluster edges (focal-cluster ↔ side-cluster)
  // are intentionally excluded from the side Dagre call so the side
  // cluster's internal shape is driven by its own connectivity, not pulled
  // toward the already-placed focal cluster.
  const restNodes = nodes.filter((n) => !placedById.has(n.id));
  if (restNodes.length > 0) {
    const restIds = new Set<string>();
    for (const node of restNodes) {
      restIds.add(node.id);
    }
    const restEdges = edges.filter(
      (e) => restIds.has(e.source) && restIds.has(e.target),
    );
    const laidOutRest = getNodesWithPositions(restNodes, restEdges);

    // Bounding box of the laid-out side cluster (in its own Dagre coords).
    let restMinX = Infinity;
    let restMinY = Infinity;
    let restMaxY = -Infinity;
    for (const node of laidOutRest) {
      const { height } = getNodeDimensions(node, placementState.dimensionsById);
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

    // Translate so the side cluster sits one extra rank-gap to the right of
    // the focal cluster (a wider gap than the normal Dagre rank separation
    // signals "separate cluster" visually) and is vertically centered on
    // the focal node.
    const dx = placementState.maxRight + DAGRE_RANK_SEP * 2 - restMinX;
    const dy = focalCenterY - (restMinY + restMaxY) / 2;

    for (const node of laidOutRest) {
      const positionedNode = {
        ...node,
        position: {
          x: node.position.x + dx,
          y: node.position.y + dy,
        },
      };
      placedById.set(node.id, positionedNode);
      registerPlacedNode(positionedNode, placementState);
    }
  }

  // Preserve original node order.
  return nodes.map((n) => placedById.get(n.id) ?? n);
}

type LayoutEdge = { source: string; target: string };

/**
 * Layout request shape consumed by {@link applyLayout}. Three modes cover the
 * full set of canvas-layout actions in the schema viewer:
 *
 *  - `fresh`: lay everything out from scratch via Dagre (manual auto-layout
 *    button, or fallback when an incremental merge isn't possible).
 *  - `focus`: rearrange around `focalId` — incoming neighbors stack on the
 *    left, outgoing on the right, the rest place relative to neighbors.
 *  - `merge`: try to preserve existing positions when the underlying graph
 *    changes incrementally (e.g. FK click adds a new table). Falls back to
 *    `fresh` automatically if the merge isn't viable; the result reports
 *    via `preservedExistingPositions` which path was taken.
 */
export type LayoutRequest =
  | {
      mode: "fresh";
      nodes: SchemaViewerFlowNode[];
      edges: LayoutEdge[];
    }
  | {
      mode: "focus";
      focalId: string;
      nodes: SchemaViewerFlowNode[];
      edges: LayoutEdge[];
    }
  | {
      mode: "merge";
      incoming: SchemaViewerFlowNode[];
      current: SchemaViewerFlowNode[];
      edges: LayoutEdge[];
    };

export type LayoutResult = {
  nodes: SchemaViewerFlowNode[];
  /**
   * `true` only when `mode: "merge"` succeeded and existing nodes kept their
   * positions. `false` for `fresh`, `focus`, and any merge that fell back
   * to a fresh Dagre layout. Callers use this to decide between zooming to
   * a specific incremental target vs fitting the whole canvas.
   */
  preservedExistingPositions: boolean;
};

/**
 * Single entry point for every canvas-layout action. Dispatches to the
 * appropriate internal primitive based on `mode` and reports back whether
 * any existing positions were preserved.
 */
export function applyLayout(req: LayoutRequest): LayoutResult {
  switch (req.mode) {
    case "fresh":
      return {
        nodes: getNodesWithPositions(req.nodes, req.edges),
        preservedExistingPositions: false,
      };
    case "focus":
      return {
        nodes: focusNodeLayout(req.focalId, req.nodes, req.edges),
        preservedExistingPositions: false,
      };
    case "merge": {
      const merged = mergeWithExistingPositions(
        req.incoming,
        req.current,
        req.edges,
      );
      if (merged != null) {
        return { nodes: merged, preservedExistingPositions: true };
      }
      return {
        nodes: getNodesWithPositions(req.incoming, req.edges),
        preservedExistingPositions: false,
      };
    }
  }
}
