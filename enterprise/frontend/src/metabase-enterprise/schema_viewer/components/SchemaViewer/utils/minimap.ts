import type { Rect, Viewport, XYPosition } from "@xyflow/react";

import type { SchemaViewerFlowEdge, SchemaViewerFlowNode } from "../types";

type Size = { width: number; height: number };

// Lightness (%) for the least and most connected nodes in each palette.
const SHADE_LIGHTNESS = {
  light: { leaf: 88, hub: 32 },
  dark: { leaf: 28, hub: 80 },
};

// Space between the fitted graph and the minimap edges.
const MINIMAP_PADDING_PX = 8;

/** Maps graph coordinates into minimap pixels, fitted and centered. */
export type MinimapTransform = {
  bounds: Rect;
  scale: number;
  offsetX: number;
  offsetY: number;
};

export type MinimapDrawContext = Pick<
  CanvasRenderingContext2D,
  "fillStyle" | "clearRect" | "fillRect"
>;

export function getMinimapTransform(
  bounds: Rect,
  size: Size,
): MinimapTransform | null {
  if (bounds.width <= 0 || bounds.height <= 0) {
    return null;
  }
  const scale = Math.min(
    (size.width - 2 * MINIMAP_PADDING_PX) / bounds.width,
    (size.height - 2 * MINIMAP_PADDING_PX) / bounds.height,
  );
  return {
    bounds,
    scale,
    offsetX: (size.width - bounds.width * scale) / 2,
    offsetY: (size.height - bounds.height * scale) / 2,
  };
}

function worldToMinimap(
  { bounds, scale, offsetX, offsetY }: MinimapTransform,
  point: XYPosition,
): XYPosition {
  return {
    x: offsetX + (point.x - bounds.x) * scale,
    y: offsetY + (point.y - bounds.y) * scale,
  };
}

export function minimapToWorld(
  { bounds, scale, offsetX, offsetY }: MinimapTransform,
  point: XYPosition,
): XYPosition {
  return {
    x: bounds.x + (point.x - offsetX) / scale,
    y: bounds.y + (point.y - offsetY) / scale,
  };
}

/**
 * The visible canvas area, in minimap pixels, grown around its center to at
 * least `minSizePx` so a zoomed-in viewport stays visible on a large graph.
 */
export function getViewportIndicator(
  transform: MinimapTransform,
  viewport: Viewport,
  canvasSize: Size,
  minSizePx = 0,
): Rect {
  const topLeft = worldToMinimap(transform, {
    x: -viewport.x / viewport.zoom,
    y: -viewport.y / viewport.zoom,
  });
  const width = (canvasSize.width / viewport.zoom) * transform.scale;
  const height = (canvasSize.height / viewport.zoom) * transform.scale;
  const shownWidth = Math.max(width, minSizePx);
  const shownHeight = Math.max(height, minSizePx);
  return {
    x: topLeft.x + (width - shownWidth) / 2,
    y: topLeft.y + (height - shownHeight) / 2,
    width: shownWidth,
    height: shownHeight,
  };
}

/** Draws every logical node, whether or not React Flow renders it. */
export function drawMinimapNodes(
  context: MinimapDrawContext,
  nodes: readonly SchemaViewerFlowNode[],
  transform: MinimapTransform,
  size: Size,
  getColor: (node: SchemaViewerFlowNode) => string,
) {
  context.clearRect(0, 0, size.width, size.height);
  for (const node of nodes) {
    const { x, y } = worldToMinimap(transform, node.position);
    context.fillStyle = getColor(node);
    context.fillRect(
      x,
      y,
      Math.max(1, (node.width ?? 0) * transform.scale),
      Math.max(1, (node.height ?? 0) * transform.scale),
    );
  }
}

/**
 * Shades each node by its edge count: hubs (more connections) read as the
 * more-prominent end of the gradient, leaves as the less-prominent end.
 * Counts are normalized against the most-connected node.
 */
export function getConnectionShading(
  edges: readonly SchemaViewerFlowEdge[],
  isDark: boolean,
) {
  const counts = new Map<string, number>();
  for (const edge of edges) {
    counts.set(edge.source, (counts.get(edge.source) ?? 0) + 1);
    if (edge.target !== edge.source) {
      counts.set(edge.target, (counts.get(edge.target) ?? 0) + 1);
    }
  }
  const maxCount = Math.max(0, ...counts.values());
  const { leaf, hub } = SHADE_LIGHTNESS[isDark ? "dark" : "light"];
  const getCount = (node: SchemaViewerFlowNode) => counts.get(node.id) ?? 0;

  return {
    getColor: (node: SchemaViewerFlowNode) => {
      const ratio = maxCount > 0 ? getCount(node) / maxCount : 0;
      return `hsl(0, 0%, ${leaf + ratio * (hub - leaf)}%)`;
    },
    /**
     * Least-connected first. On a large graph nodes shrink to overlapping
     * pixels, so drawing hubs last keeps them visible.
     */
    orderForDrawing: (nodes: readonly SchemaViewerFlowNode[]) =>
      [...nodes].sort((a, b) => getCount(a) - getCount(b)),
  };
}
