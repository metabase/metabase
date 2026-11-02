import { type Viewport, getViewportForBounds } from "@xyflow/react";

import { FIT_VIEW_OPTIONS, MAX_ZOOM, NODE_WIDTH_PX } from "../constants";
import type { SchemaViewerFlowEdge, SchemaViewerFlowNode } from "../types";

import { getGraphBounds } from "./viewport-window";

export type CanvasSize = { width: number; height: number };

// (if this value changes, update the same constant in e2e/test/scenarios/data-studio/schema-viewer.cy.spec.ts)
const MIN_ZOOM_FOR_TARGET = 0.5;
// How far below the viewport's top edge the header of the topmost target
// node should land.
const TOP_MARGIN_PX = 50;
// Fractional horizontal padding applied to the bounding-box width when
// computing the width-based zoom level.
const HORIZONTAL_PADDING = 0.15;
// Above this many tables the overview centers on the most connected table
// instead of the middle of the graph.
const MAX_TABLES_TO_CENTER_GRAPH = 10;
// Animation duration for the camera pan/zoom.
export const ZOOM_DURATION_MS = 500;

/**
 *  - Zoom is clamped to MIN_ZOOM_FOR_TARGET so tables
 *    stay legible even for wide selections.
 *  - Zoom is computed from the bounding-box WIDTH only. Height is
 *    intentionally ignored so that tall tables don't force a low zoom; they
 *    simply overflow the viewport vertically, which is fine as long as the
 *    header stays visible.
 *  - The camera is positioned so the TOP of the target bounding box
 *    below the viewport's top edge, rather than centered.
 */
export function getNodeFocusViewport(
  nodes: readonly SchemaViewerFlowNode[],
  nodeId: string,
  size: CanvasSize,
): Viewport | null {
  // Read logical nodes: the target may not be rendered by React Flow yet.
  const target = nodes.find((n) => n.id === nodeId);
  if (!target) {
    return null;
  }
  const width =
    typeof target.style?.width === "number"
      ? target.style.width
      : NODE_WIDTH_PX;
  const zoom = Math.max(
    MIN_ZOOM_FOR_TARGET,
    Math.min(size.width / (width * (1 + 2 * HORIZONTAL_PADDING)), MAX_ZOOM),
  );
  const centerX = target.position.x + width / 2;
  return {
    x: size.width / 2 - centerX * zoom,
    y: TOP_MARGIN_PX - target.position.y * zoom,
    zoom,
  };
}

/**
 * Fits all logical nodes. React Flow's `fitView` only sees rendered nodes,
 * which is a subset once the graph is virtualized.
 */
export function getGraphFitViewport(
  nodes: readonly SchemaViewerFlowNode[],
  size: CanvasSize,
): Viewport | null {
  const bounds = getGraphBounds(nodes);
  if (bounds == null) {
    return null;
  }
  return getViewportForBounds(
    bounds,
    size.width,
    size.height,
    FIT_VIEW_OPTIONS.minZoom,
    FIT_VIEW_OPTIONS.maxZoom,
    FIT_VIEW_OPTIONS.padding,
  );
}

/** The node with the most edges, first in node order on a tie. */
function getMostConnectedNode(
  nodes: readonly SchemaViewerFlowNode[],
  edges: readonly SchemaViewerFlowEdge[],
): SchemaViewerFlowNode | null {
  const edgeCounts = new Map<string, number>();
  for (const { source, target } of edges) {
    edgeCounts.set(source, (edgeCounts.get(source) ?? 0) + 1);
    if (target !== source) {
      edgeCounts.set(target, (edgeCounts.get(target) ?? 0) + 1);
    }
  }
  let mostConnected: SchemaViewerFlowNode | null = null;
  let maxEdgeCount = 0;
  for (const node of nodes) {
    const edgeCount = edgeCounts.get(node.id) ?? 0;
    if (edgeCount > maxEdgeCount) {
      mostConnected = node;
      maxEdgeCount = edgeCount;
    }
  }
  return mostConnected;
}

/**
 * The overview after a fresh layout: the whole-graph fit, centered on the
 * most connected table when the graph has more than
 * `MAX_TABLES_TO_CENTER_GRAPH` tables. A table taller than the screen is
 * top-aligned instead, so its header stays visible.
 */
export function getGraphOverviewViewport(
  nodes: readonly SchemaViewerFlowNode[],
  edges: readonly SchemaViewerFlowEdge[],
  size: CanvasSize,
): Viewport | null {
  const fit = getGraphFitViewport(nodes, size);
  if (fit == null || nodes.length <= MAX_TABLES_TO_CENTER_GRAPH) {
    return fit;
  }
  const hub = getMostConnectedNode(nodes, edges);
  if (hub == null) {
    return fit;
  }
  const { zoom } = fit;
  const width = hub.width ?? NODE_WIDTH_PX;
  const height = hub.height ?? 0;
  const maxCenteredHeight = (size.height - 2 * TOP_MARGIN_PX) / zoom;
  const centerX = hub.position.x + width / 2;
  const centerY = hub.position.y + Math.min(height, maxCenteredHeight) / 2;
  return {
    x: size.width / 2 - centerX * zoom,
    y: size.height / 2 - centerY * zoom,
    zoom,
  };
}

export function getCanvasSize(): CanvasSize | null {
  const rect = document.querySelector(".react-flow")?.getBoundingClientRect();
  if (rect == null || rect.width === 0 || rect.height === 0) {
    return null;
  }
  return { width: rect.width, height: rect.height };
}
