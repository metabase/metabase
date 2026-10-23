import { Position, type XYPosition, getSmoothStepPath } from "@xyflow/react";

import type {
  SchemaViewerEdgeData,
  SchemaViewerFlowEdge,
  SchemaViewerFlowNode,
  SchemaViewerNodeHandle,
} from "../types";

/** Everything needed to draw and hit-test one edge, in graph coordinates. */
export type EdgeGeometry = {
  id: string;
  path: string;
  symbolPath: string;
  /** Vertices of `path`, used for hit testing. */
  points: XYPosition[];
};

type Anchor = XYPosition & { position: Position };

// Self-reference loop geometry
const SELF_REF_OFFSET = 50;
const SELF_REF_RADIUS = 8;

// Crow's foot (many-to-one symbol) geometry
const SYMBOL_GAP = 4;
const SYMBOL_WIDTH = 8;
const SYMBOL_HALF_HEIGHT = 6;

type SymbolType = "one" | "many";
type SymbolSide = "source" | "target";

/** Matches React Flow's handle anchoring so edges meet the card edges exactly. */
function getAnchor(
  node: SchemaViewerFlowNode,
  handle: SchemaViewerNodeHandle,
): Anchor {
  const x = node.position.x + handle.x;
  const y = node.position.y + handle.y + handle.height / 2;
  return {
    x: handle.position === Position.Right ? x + handle.width : x,
    y,
    position: handle.position,
  };
}

function findHandle(
  node: SchemaViewerFlowNode,
  type: SchemaViewerNodeHandle["type"],
  handleId: string | null | undefined,
) {
  return node.data.handles.find(
    (handle) => handle.type === type && handle.id === handleId,
  );
}

/**
 * Builds an SVG path that loops from a source handle on the right side of a
 * table around to a target handle on the same table.
 */
export function getSelfRefEdgePath(source: XYPosition, target: XYPosition) {
  const midX = Math.max(source.x, target.x) + SELF_REF_OFFSET;
  const r = SELF_REF_RADIUS;
  const sourceTurn = source.y < target.y ? r : -r;
  const targetTurn = source.y < target.y ? -r : r;
  return [
    `M ${source.x} ${source.y}`,
    `L ${midX - r} ${source.y}`,
    `Q ${midX} ${source.y} ${midX} ${source.y + sourceTurn}`,
    `L ${midX} ${target.y + targetTurn}`,
    `Q ${midX} ${target.y} ${midX - r} ${target.y}`,
    `L ${target.x} ${target.y}`,
  ].join(" ");
}

function getSymbolPath(
  type: SymbolType,
  side: SymbolSide,
  { x, y }: XYPosition,
) {
  const direction = side === "source" ? 1 : -1;
  const anchorX = x + direction * SYMBOL_GAP;
  const top = y - SYMBOL_HALF_HEIGHT;
  const bottom = y + SYMBOL_HALF_HEIGHT;
  if (type === "one") {
    return `M${anchorX} ${top}L${anchorX} ${bottom}`;
  }
  const backX = x + direction * (SYMBOL_GAP + SYMBOL_WIDTH);
  return `M${backX} ${y}L${anchorX} ${top}M${backX} ${y}L${anchorX} ${bottom}`;
}

function getSymbolTypes(relationship: SchemaViewerEdgeData["relationship"]): {
  source: SymbolType;
  target: SymbolType;
} {
  if (relationship === "one-to-one") {
    return { source: "one", target: "one" };
  }
  return { source: "many", target: "one" };
}

/** Every coordinate pair in a path made of M/L/Q commands, in order. */
function getPathPoints(path: string): XYPosition[] {
  const numbers = path.match(/-?\d*\.?\d+(?:e-?\d+)?/gi)?.map(Number) ?? [];
  const points: XYPosition[] = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    points.push({ x: numbers[i], y: numbers[i + 1] });
  }
  return points;
}

export function getEdgeGeometry(
  edge: SchemaViewerFlowEdge,
  nodesById: ReadonlyMap<string, SchemaViewerFlowNode>,
): EdgeGeometry | null {
  const sourceNode = nodesById.get(edge.source);
  const targetNode = nodesById.get(edge.target);
  if (sourceNode == null || targetNode == null) {
    return null;
  }
  const sourceHandle = findHandle(sourceNode, "source", edge.sourceHandle);
  const targetHandle = findHandle(targetNode, "target", edge.targetHandle);
  if (sourceHandle == null || targetHandle == null) {
    return null;
  }

  const source = getAnchor(sourceNode, sourceHandle);
  const target = getAnchor(targetNode, targetHandle);
  const isSelfRef = edge.source === edge.target;
  const path = isSelfRef
    ? getSelfRefEdgePath(source, target)
    : getSmoothStepPath({
        sourceX: source.x,
        sourceY: source.y,
        sourcePosition: source.position,
        targetX: target.x,
        targetY: target.y,
        targetPosition: target.position,
      })[0];
  const symbols = getSymbolTypes(edge.data?.relationship ?? "many-to-one");

  return {
    id: edge.id,
    path,
    // A self-reference ends on the right side, so its target symbol faces
    // the same way as the source symbol.
    symbolPath:
      getSymbolPath(symbols.source, "source", source) +
      getSymbolPath(symbols.target, isSelfRef ? "source" : "target", target),
    points: getPathPoints(path),
  };
}

function getDistanceToSegment(
  point: XYPosition,
  start: XYPosition,
  end: XYPosition,
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((point.x - start.x) * dx + (point.y - start.y) * dy) /
              lengthSquared,
          ),
        );
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

/** The id of the edge nearest to `point` within `tolerance`, if any. */
export function findEdgeAtPoint(
  geometries: readonly EdgeGeometry[],
  point: XYPosition,
  tolerance: number,
): string | null {
  let nearestId: string | null = null;
  let nearestDistance = tolerance;
  for (const geometry of geometries) {
    for (let i = 1; i < geometry.points.length; i++) {
      const distance = getDistanceToSegment(
        point,
        geometry.points[i - 1],
        geometry.points[i],
      );
      if (distance <= nearestDistance) {
        nearestDistance = distance;
        nearestId = geometry.id;
      }
    }
  }
  return nearestId;
}
