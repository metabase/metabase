import dagre from "@dagrejs/dagre";
import { memoize } from "underscore";

import { isTypeFK, isTypePK } from "metabase-lib/v1/types/utils/isa";
import type {
  ErdEdge,
  ErdField,
  ErdNode,
  ErdResponse,
  TableId,
} from "metabase-types/api";

import {
  DAGRE_NODE_SEP,
  DAGRE_RANK_SEP,
  HEADER_HEIGHT,
  NODE_WIDTH,
  ROW_HEIGHT,
} from "./constants";
import type { SchemaViewerFlowEdge, SchemaViewerFlowNode } from "./types";

// Minimum visual gap to leave between a newly-placed node and any existing one
const COLLISION_PADDING = 20;
// Vertical step used when walking to find a free slot for an incoming node
const COLLISION_Y_STEP = 100;
// Maximum number of Y steps to try before giving up on a given column
const MAX_COLLISION_Y_STEPS = 40;

function sortFields(fields: ErdField[]): ErdField[] {
  return [...fields].sort((a, b) => {
    const aPK = isTypePK(a.semantic_type);
    const bPK = isTypePK(b.semantic_type);
    const aFK = isTypeFK(a.semantic_type);
    const bFK = isTypeFK(b.semantic_type);

    // PK first
    if (aPK && !bPK) {
      return -1;
    }
    if (!aPK && bPK) {
      return 1;
    }
    // FK second
    if (aFK && !bFK) {
      return -1;
    }
    if (!aFK && bFK) {
      return 1;
    }
    // Keep original order for same category
    return 0;
  });
}

export function getNodeId(node: { table_id: TableId }): string {
  return `table-${node.table_id}`;
}

function getNodeHeight(node: ErdNode): number {
  return HEADER_HEIGHT + node.fields.length * ROW_HEIGHT;
}

interface TableEdgeRoles {
  sourceFieldIds: Set<number>;
  targetFieldIds: Set<number>;
  selfRefTargetFieldIds: Set<number>;
}

const EMPTY_ROLES: TableEdgeRoles = {
  sourceFieldIds: new Set(),
  targetFieldIds: new Set(),
  selfRefTargetFieldIds: new Set(),
};

function toFlowNode(
  node: ErdNode,
  roles: TableEdgeRoles,
): SchemaViewerFlowNode {
  return {
    id: getNodeId(node),
    type: "schemaViewerTable",
    position: { x: 0, y: 0 },
    data: {
      ...node,
      fields: sortFields(node.fields),
      sourceFieldIds: roles.sourceFieldIds,
      targetFieldIds: roles.targetFieldIds,
      selfRefTargetFieldIds: roles.selfRefTargetFieldIds,
    },
    style: {
      width: NODE_WIDTH,
      height: getNodeHeight(node),
      opacity: 0, // Hide until positioned by dagre layout
    },
  };
}

function toFlowEdge(edge: ErdEdge): SchemaViewerFlowEdge {
  const isSelfRef = edge.source_table_id === edge.target_table_id;
  return {
    id: `edge-${edge.source_field_id}-${edge.target_field_id}`,
    source: `table-${edge.source_table_id}`,
    target: `table-${edge.target_table_id}`,
    sourceHandle: `field-${edge.source_field_id}`,
    targetHandle: isSelfRef
      ? `field-${edge.target_field_id}-right`
      : `field-${edge.target_field_id}`,
    type: "schemaViewerEdge",
    data: {
      relationship: edge.relationship,
    },
  };
}

function getFlowGraphMemoKey(data: ErdResponse): string {
  const nodeKey = data.nodes
    .map((node) => {
      const fieldKey = node.fields
        .map(
          (field) =>
            `${field.id}:${field.semantic_type ?? ""}:${field.fk_target_field_id ?? ""}`,
        )
        .join("|");
      return `${node.table_id}:${fieldKey}`;
    })
    .sort()
    .join(";");

  const edgeKey = data.edges
    .map(
      (edge) =>
        `${edge.source_table_id}:${edge.source_field_id}->${edge.target_table_id}:${edge.target_field_id}:${edge.relationship}`,
    )
    .sort()
    .join(";");

  return `${nodeKey}__${edgeKey}`;
}

const memoizedToFlowGraph = memoize((data: ErdResponse) => {
  // Per-table roles: which fields act as source, target, or self-ref target
  // of any edge. Handle rendering keys off this (not off semantic_type) so an
  // edge whose target field isn't tagged as a PK still gets a matching handle.
  const rolesByTable = new Map<TableId, TableEdgeRoles>();
  const ensureRoles = (tableId: TableId): TableEdgeRoles => {
    let roles = rolesByTable.get(tableId);
    if (roles == null) {
      roles = {
        sourceFieldIds: new Set(),
        targetFieldIds: new Set(),
        selfRefTargetFieldIds: new Set(),
      };
      rolesByTable.set(tableId, roles);
    }
    return roles;
  };
  for (const edge of data.edges) {
    ensureRoles(edge.source_table_id).sourceFieldIds.add(edge.source_field_id);
    const isSelfRef = edge.source_table_id === edge.target_table_id;
    const targetRoles = ensureRoles(edge.target_table_id);
    if (isSelfRef) {
      targetRoles.selfRefTargetFieldIds.add(edge.target_field_id);
    } else {
      targetRoles.targetFieldIds.add(edge.target_field_id);
    }
  }

  return {
    nodes: data.nodes.map((node) =>
      toFlowNode(node, rolesByTable.get(node.table_id) ?? EMPTY_ROLES),
    ),
    edges: data.edges.map((edge) => toFlowEdge(edge)),
  };
}, getFlowGraphMemoKey);

export function toFlowGraph(data: ErdResponse): {
  nodes: SchemaViewerFlowNode[];
  edges: SchemaViewerFlowEdge[];
} {
  return memoizedToFlowGraph(data);
}

function getLayoutNodeHeight(node: SchemaViewerFlowNode): number {
  const fieldCount = node.data.fields?.length ?? 0;
  return HEADER_HEIGHT + fieldCount * ROW_HEIGHT;
}

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
    const height = getLayoutNodeHeight(node);
    dagreGraph.setNode(node.id, {
      width: NODE_WIDTH,
      height,
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
  for (const node of incoming) {
    const existing = currentById.get(node.id);
    if (existing != null) {
      // Preserve position and style (keeps opacity: 1, measured width/height).
      placedById.set(node.id, {
        ...node,
        position: existing.position,
        style: existing.style,
      });
    }
  }

  // Remaining = new tables still to position.
  let remaining = incoming.filter((n) => !currentById.has(n.id));

  // Iterate in passes: a new node is placeable once at least one of its
  // connected neighbors has been placed (either originally existing or
  // positioned in an earlier pass).
  let progressed = true;
  while (remaining.length > 0 && progressed) {
    progressed = false;
    const stillRemaining: SchemaViewerFlowNode[] = [];
    for (const node of remaining) {
      const connectingEdge = edges.find(
        (e) =>
          (e.source === node.id && placedById.has(e.target)) ||
          (e.target === node.id && placedById.has(e.source)),
      );
      if (connectingEdge == null) {
        stillRemaining.push(node);
        continue;
      }
      const neighborId =
        connectingEdge.source === node.id
          ? connectingEdge.target
          : connectingEdge.source;
      const neighbor = placedById.get(neighborId)!;
      // rankdir: LR — target sits to the right of source.
      const prefersRight = connectingEdge.target === node.id;
      const position = findNonCollidingPosition(
        node,
        neighbor,
        prefersRight,
        placedById,
      );
      placedById.set(node.id, {
        ...node,
        position,
        style: {
          ...node.style,
          opacity: 1, // Visible immediately; no Dagre pass needed.
        },
      });
      progressed = true;
    }
    remaining = stillRemaining;
  }

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
  placed: Map<string, SchemaViewerFlowNode>,
): { x: number; y: number } {
  const nodeWidth = getStyleDimension(newNode, "width") ?? NODE_WIDTH;
  const nodeHeight = getStyleDimension(newNode, "height") ?? HEADER_HEIGHT;
  const xOffset = NODE_WIDTH + DAGRE_RANK_SEP;
  const preferredX = prefersRight
    ? neighbor.position.x + xOffset
    : neighbor.position.x - xOffset;
  const alternateX = prefersRight
    ? neighbor.position.x - xOffset
    : neighbor.position.x + xOffset;
  const baseY = neighbor.position.y;

  const fits = (x: number, y: number) =>
    !collidesWithAny(x, y, nodeWidth, nodeHeight, placed);

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
  let maxRight = 0;
  for (const n of placed.values()) {
    const w = getStyleDimension(n, "width") ?? NODE_WIDTH;
    maxRight = Math.max(maxRight, n.position.x + w);
  }
  return { x: maxRight + DAGRE_RANK_SEP, y: baseY };
}

function collidesWithAny(
  x: number,
  y: number,
  width: number,
  height: number,
  placed: Map<string, SchemaViewerFlowNode>,
): boolean {
  for (const node of placed.values()) {
    const nx = node.position.x;
    const ny = node.position.y;
    const nw = getStyleDimension(node, "width") ?? NODE_WIDTH;
    const nh = getStyleDimension(node, "height") ?? 0;
    if (
      x < nx + nw + COLLISION_PADDING &&
      x + width + COLLISION_PADDING > nx &&
      y < ny + nh + COLLISION_PADDING &&
      y + height + COLLISION_PADDING > ny
    ) {
      return true;
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
  const focalWidth = getStyleDimension(focal, "width") ?? NODE_WIDTH;
  const focalHeight = getStyleDimension(focal, "height") ?? HEADER_HEIGHT;
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

  const placedById = new Map<string, SchemaViewerFlowNode>();
  placedById.set(focalId, {
    ...focal,
    style: { ...focal.style, opacity: 1 },
  });

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
      (n) => getStyleDimension(n, "height") ?? HEADER_HEIGHT,
    );
    const totalHeight =
      heights.reduce((sum, h) => sum + h, 0) +
      columnGap * (neighbors.length - 1);
    let cursorY = focalCenterY - totalHeight / 2;
    for (let i = 0; i < neighbors.length; i++) {
      const node = neighbors[i];
      placedById.set(node.id, {
        ...node,
        position: { x, y: cursorY },
        style: { ...node.style, opacity: 1 },
      });
      cursorY += heights[i] + columnGap;
    }
  };

  placeColumn(incomingIds, focal.position.x - NODE_WIDTH - DAGRE_RANK_SEP);
  placeColumn(outgoingIds, focal.position.x + focalWidth + DAGRE_RANK_SEP);

  // Anything not directly connected to the focal node: place it next to a
  // neighbor that's already positioned. Iterate in passes — just like the
  // FK-expansion merge path — so chains keep growing outward.
  let remaining = nodes.filter((n) => !placedById.has(n.id));
  let progressed = true;
  while (remaining.length > 0 && progressed) {
    progressed = false;
    const stillRemaining: SchemaViewerFlowNode[] = [];
    for (const node of remaining) {
      const connectingEdge = edges.find(
        (e) =>
          (e.source === node.id && placedById.has(e.target)) ||
          (e.target === node.id && placedById.has(e.source)),
      );
      if (connectingEdge == null) {
        stillRemaining.push(node);
        continue;
      }
      const neighborId =
        connectingEdge.source === node.id
          ? connectingEdge.target
          : connectingEdge.source;
      const neighbor = placedById.get(neighborId)!;
      // rankdir: LR — target sits to the right of source.
      const prefersRight = connectingEdge.target === node.id;
      const position = findNonCollidingPosition(
        node,
        neighbor,
        prefersRight,
        placedById,
      );
      placedById.set(node.id, {
        ...node,
        position,
        style: { ...node.style, opacity: 1 },
      });
      progressed = true;
    }
    remaining = stillRemaining;
  }

  // Fully disconnected leftovers: drop them in a fresh column to the right
  // of everything that's already placed, stacked top-down. This keeps them
  // out of the focal layout while still making them reachable via pan.
  if (remaining.length > 0) {
    let maxRight = 0;
    for (const node of placedById.values()) {
      const w = getStyleDimension(node, "width") ?? NODE_WIDTH;
      maxRight = Math.max(maxRight, node.position.x + w);
    }
    let cursorY = focal.position.y;
    for (const node of remaining) {
      const h = getStyleDimension(node, "height") ?? HEADER_HEIGHT;
      placedById.set(node.id, {
        ...node,
        position: { x: maxRight + DAGRE_RANK_SEP, y: cursorY },
        style: { ...node.style, opacity: 1 },
      });
      cursorY += h + columnGap;
    }
  }

  // Preserve original node order.
  return nodes.map((n) => placedById.get(n.id) ?? n);
}
