import { HEADER_HEIGHT_PX, NODE_WIDTH_PX } from "../../constants";
import type { SchemaViewerFlowNode } from "../../types";

import {
  COLLISION_PADDING_PX,
  COLLISION_Y_STEP_PX,
  DAGRE_RANK_SEP_PX,
  MAX_COLLISION_Y_STEPS,
} from "./constants";
import type { NodeDimensions, PlacementSide } from "./types";

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

/**
 * Owns the mutable placement state for one layout pass: which nodes have
 * already been positioned, their dimensions, and the spatial index used to
 * find non-overlapping slots for subsequent nodes.
 */
export class PlacementCanvas {
  private columns: OccupiedColumn[] = [];
  private columnsByX = new Map<number, OccupiedColumn>();
  private dimensionsById = new Map<string, NodeDimensions>();
  private nodesById = new Map<string, SchemaViewerFlowNode>();
  private placedById = new Map<string, SchemaViewerFlowNode>();
  private maxRight = 0;
  private maxColumnWidth = 0;

  constructor(nodes: SchemaViewerFlowNode[]) {
    for (const node of nodes) {
      this.nodesById.set(node.id, node);
      this.dimensionsById.set(node.id, getNodeDimensions(node));
    }
  }

  get rightEdge(): number {
    return this.maxRight;
  }

  getDimensions(node: SchemaViewerFlowNode): NodeDimensions {
    return getNodeDimensions(node, this.dimensionsById);
  }

  getNode(id: string): SchemaViewerFlowNode | undefined {
    return this.nodesById.get(id);
  }

  hasPlaced(id: string): boolean {
    return this.placedById.has(id);
  }

  getPlaced(id: string): SchemaViewerFlowNode | undefined {
    return this.placedById.get(id);
  }

  getPlacedNodesInOrder(nodes: SchemaViewerFlowNode[]): SchemaViewerFlowNode[] {
    return nodes.map((node) => this.placedById.get(node.id)!);
  }

  getPlacedOrOriginalNodesInOrder(
    nodes: SchemaViewerFlowNode[],
  ): SchemaViewerFlowNode[] {
    return nodes.map((node) => this.placedById.get(node.id) ?? node);
  }

  place(
    node: SchemaViewerFlowNode,
    position: { x: number; y: number },
  ): SchemaViewerFlowNode {
    const positionedNode = {
      ...node,
      position,
      style: {
        ...node.style,
        opacity: 1,
      },
    };
    this.registerPlacedNode(positionedNode);
    return positionedNode;
  }

  preserve(
    node: SchemaViewerFlowNode,
    existing: SchemaViewerFlowNode,
  ): SchemaViewerFlowNode {
    const positionedNode = {
      ...node,
      position: existing.position,
      style: existing.style,
    };
    this.registerPlacedNode(positionedNode);
    return positionedNode;
  }

  private registerPlacedNode(node: SchemaViewerFlowNode): void {
    this.placedById.set(node.id, node);
    const { width, height } = this.getDimensions(node);
    const x = node.position.x;
    const y = node.position.y;
    const occupied: OccupiedBox = {
      left: x,
      right: x + width,
      top: y,
      bottom: y + height,
    };
    const column = this.columnsByX.get(x);
    if (column == null) {
      const newColumn = {
        left: occupied.left,
        right: occupied.right,
        boxes: [occupied],
      };
      this.columnsByX.set(x, newColumn);
      insertColumn(newColumn, this.columns);
    } else {
      column.right = Math.max(column.right, occupied.right);
      column.boxes.push(occupied);
    }
    this.maxRight = Math.max(this.maxRight, occupied.right);
    this.maxColumnWidth = Math.max(this.maxColumnWidth, width);
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
  findNearestOpenSlot(
    newNode: SchemaViewerFlowNode,
    neighbor: SchemaViewerFlowNode,
    preferredSide: PlacementSide,
  ): { x: number; y: number } {
    const { width, height } = this.getDimensions(newNode);
    const preferredX = getAdjacentX(newNode, neighbor, preferredSide, this);
    const alternateX = getAdjacentX(
      newNode,
      neighbor,
      preferredSide === "right" ? "left" : "right",
      this,
    );
    const baseY = neighbor.position.y;

    const fits = (x: number, y: number) =>
      !this.collidesWithAny(x, y, width, height);

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
      const dy = i * COLLISION_Y_STEP_PX;
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
    return { x: this.maxRight + DAGRE_RANK_SEP_PX, y: baseY };
  }

  /**
   * Tests a candidate box against nearby occupied columns, using the sorted
   * column index to skip boxes that cannot overlap horizontally.
   */
  private collidesWithAny(
    x: number,
    y: number,
    width: number,
    height: number,
  ): boolean {
    const left = x;
    const right = x + width;
    const top = y;
    const bottom = y + height;
    const firstColumn = getFirstColumnAtOrAfter(
      this.columns,
      left - this.maxColumnWidth - COLLISION_PADDING_PX,
    );

    for (let i = firstColumn; i < this.columns.length; i++) {
      const column = this.columns[i];
      if (column.left >= right + COLLISION_PADDING_PX) {
        break;
      }
      if (left >= column.right + COLLISION_PADDING_PX) {
        continue;
      }
      for (const box of column.boxes) {
        if (
          left < box.right + COLLISION_PADDING_PX &&
          right + COLLISION_PADDING_PX > box.left &&
          top < box.bottom + COLLISION_PADDING_PX &&
          bottom + COLLISION_PADDING_PX > box.top
        ) {
          return true;
        }
      }
    }
    return false;
  }
}

export function createPlacementCanvas(
  nodes: SchemaViewerFlowNode[],
): PlacementCanvas {
  return new PlacementCanvas(nodes);
}

function getAdjacentX(
  newNode: SchemaViewerFlowNode,
  neighbor: SchemaViewerFlowNode,
  side: PlacementSide,
  canvas: PlacementCanvas,
): number {
  const { width } = canvas.getDimensions(newNode);
  const { width: neighborWidth } = canvas.getDimensions(neighbor);
  return side === "right"
    ? neighbor.position.x + neighborWidth + DAGRE_RANK_SEP_PX
    : neighbor.position.x - width - DAGRE_RANK_SEP_PX;
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
      width: getStyleDimension(node, "width") ?? NODE_WIDTH_PX,
      height: getStyleDimension(node, "height") ?? HEADER_HEIGHT_PX,
    }
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
