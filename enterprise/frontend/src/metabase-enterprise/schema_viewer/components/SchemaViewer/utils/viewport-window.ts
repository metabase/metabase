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

type WindowBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

/**
 * Flow-space bounds of a viewport expanded by `overscanViewports` viewport
 * sizes on every side, or null for invalid geometry.
 */
function getWindowBounds(
  { viewport, size }: SettledViewport,
  overscanViewports: number,
): WindowBounds | null {
  const { x, y, zoom } = viewport;
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !isPositiveFinite(zoom) ||
    !isPositiveFinite(size.width) ||
    !isPositiveFinite(size.height)
  ) {
    return null;
  }

  const width = size.width / zoom;
  const height = size.height / zoom;
  const left = -x / zoom;
  const top = -y / zoom;
  return {
    left: left - width * overscanViewports,
    top: top - height * overscanViewports,
    right: left + width * (1 + overscanViewports),
    bottom: top + height * (1 + overscanViewports),
  };
}

/**
 * Whether the visible area is entirely inside the window around `settled`
 * expanded by `overscanViewports`, i.e. everything on screen is already in
 * that window.
 */
export function isViewportInWindow(
  visible: SettledViewport,
  settled: SettledViewport,
  overscanViewports: number,
): boolean {
  const visibleBounds = getWindowBounds(visible, 0);
  const windowBounds = getWindowBounds(settled, overscanViewports);
  return (
    visibleBounds != null &&
    windowBounds != null &&
    visibleBounds.left >= windowBounds.left &&
    visibleBounds.top >= windowBounds.top &&
    visibleBounds.right <= windowBounds.right &&
    visibleBounds.bottom <= windowBounds.bottom
  );
}

/**
 * Returns IDs of nodes intersecting the settled viewport expanded by
 * `overscanViewports` viewport sizes on every side.
 */
export function getNodeIdsInViewportWindow(
  nodes: readonly SchemaViewerFlowNode[],
  settledViewport: SettledViewport,
  overscanViewports: number,
): Set<string> {
  const nodeIds = new Set<string>();
  const bounds = getWindowBounds(settledViewport, overscanViewports);
  if (bounds == null) {
    return nodeIds;
  }

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
      nodeLeft + width >= bounds.left &&
      nodeLeft <= bounds.right &&
      nodeTop + height >= bounds.top &&
      nodeTop <= bounds.bottom;
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
