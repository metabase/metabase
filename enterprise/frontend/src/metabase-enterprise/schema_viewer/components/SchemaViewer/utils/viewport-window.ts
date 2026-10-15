import type { Rect, Viewport } from "@xyflow/react";

import type { SchemaViewerFlowEdge, SchemaViewerFlowNode } from "../types";

export type ViewportSize = {
  width: number;
  height: number;
};

export type SettledViewport = {
  viewport: Viewport;
  size: ViewportSize;
};

function isPositiveFinite(value: number) {
  return Number.isFinite(value) && value > 0;
}

/**
 * Returns IDs of nodes intersecting the settled viewport expanded by
 * `overscanViewports` viewport sizes on every side.
 */
export function getNodeIdsInViewportWindow(
  nodes: readonly SchemaViewerFlowNode[],
  { viewport, size }: SettledViewport,
  overscanViewports: number,
): Set<string> {
  const { x, y, zoom } = viewport;
  const nodeIds = new Set<string>();
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !isPositiveFinite(zoom) ||
    !isPositiveFinite(size.width) ||
    !isPositiveFinite(size.height)
  ) {
    return nodeIds;
  }

  const viewportWidth = size.width / zoom;
  const viewportHeight = size.height / zoom;
  const viewportLeft = -x / zoom;
  const viewportTop = -y / zoom;
  const windowLeft = viewportLeft - viewportWidth * overscanViewports;
  const windowRight = viewportLeft + viewportWidth * (1 + overscanViewports);
  const windowTop = viewportTop - viewportHeight * overscanViewports;
  const windowBottom = viewportTop + viewportHeight * (1 + overscanViewports);

  for (const node of nodes) {
    const { width, height } = node;
    const { x: nodeLeft, y: nodeTop } = node.position;
    if (
      width == null ||
      height == null ||
      !isPositiveFinite(width) ||
      !isPositiveFinite(height) ||
      !Number.isFinite(nodeLeft) ||
      !Number.isFinite(nodeTop)
    ) {
      continue;
    }

    const intersectsWindow =
      nodeLeft + width >= windowLeft &&
      nodeLeft <= windowRight &&
      nodeTop + height >= windowTop &&
      nodeTop <= windowBottom;
    if (intersectsWindow) {
      nodeIds.add(node.id);
    }
  }

  return nodeIds;
}

/**
 * The rendered nodes, and every edge touching them. Edges are drawn from
 * logical positions, so an edge to an unrendered table still appears.
 */
export function getRenderedGraph(
  nodes: SchemaViewerFlowNode[],
  edges: SchemaViewerFlowEdge[],
  renderedNodeIds: ReadonlySet<string>,
) {
  return {
    nodes: nodes.filter((node) => renderedNodeIds.has(node.id)),
    edges: edges.filter(
      (edge) =>
        renderedNodeIds.has(edge.source) || renderedNodeIds.has(edge.target),
    ),
  };
}

/** Bounds of all logical nodes, independent of what React Flow has mounted. */
export function getGraphBounds(
  nodes: readonly SchemaViewerFlowNode[],
): Rect | null {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const node of nodes) {
    left = Math.min(left, node.position.x);
    top = Math.min(top, node.position.y);
    right = Math.max(right, node.position.x + (node.width ?? 0));
    bottom = Math.max(bottom, node.position.y + (node.height ?? 0));
  }
  if (!Number.isFinite(left) || !Number.isFinite(top)) {
    return null;
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}
