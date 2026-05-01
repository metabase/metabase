import type { ReactFlowInstance } from "@xyflow/react";

import { MAX_ZOOM, NODE_WIDTH } from "../constants";
import type { SchemaViewerFlowEdge, SchemaViewerFlowNode } from "../types";

type ZoomTarget = Pick<
  ReactFlowInstance<SchemaViewerFlowNode, SchemaViewerFlowEdge>,
  "setCenter" | "getNodes"
>;

// Never zoom in closer than this — below 0.5 tables are unreadable.
const MIN_ZOOM_FOR_TARGET = 0.5;
// How far below the viewport's top edge the header of the topmost target
// node should land, in screen pixels.
const TOP_MARGIN_PX = 40;
// Fractional horizontal padding applied to the bounding-box width when
// computing the width-based zoom level.
const HORIZONTAL_PADDING = 0.15;
// Animation duration for the camera pan/zoom, in milliseconds. Shared with
// the full-canvas `fitView` callers so every camera move has the same feel.
const DURATION_MS = 500;

/**
 * Returns a function that pans + zooms the camera to show the given nodes.
 *
 * Rules (shared across all zoom-to-node entry points — FK field click,
 * table selector focus button, table node double-click, fresh-table
 * expansion, edge double-click):
 *
 *  - Zoom is clamped to at least {@link MIN_ZOOM_FOR_TARGET} (0.5) so tables
 *    stay legible even for wide selections. Capped at {@link MAX_ZOOM}.
 *  - Zoom is computed from the bounding-box WIDTH only. Height is
 *    intentionally ignored so that tall tables don't force a low zoom; they
 *    simply overflow the viewport vertically, which is fine as long as the
 *    header stays visible (next bullet).
 *  - The camera is positioned so the TOP of the target bounding box (which
 *    for a single table is the header region) sits {@link TOP_MARGIN_PX}
 *    below the viewport's top edge, rather than centered. This keeps the
 *    table name visible whenever you zoom to it, no matter how tall the
 *    table is.
 */
/**
 * Pure variant of {@link useZoomToNodes} — accepts the React Flow instance
 * directly so it can be called from components OUTSIDE the `<ReactFlow>`
 * subtree (where `useReactFlow()` is unavailable). The hook below wraps
 * this for in-tree callers.
 */
export function zoomToNodes(instance: ZoomTarget, nodeIds: readonly string[]) {
  if (nodeIds.length === 0) {
    return;
  }
  const idSet = new Set(nodeIds);
  const targets = instance.getNodes().filter((n) => idSet.has(n.id));
  if (targets.length === 0) {
    return;
  }

  const viewportEl = document.querySelector(".react-flow");
  const rect = viewportEl?.getBoundingClientRect();
  if (rect == null || rect.width === 0 || rect.height === 0) {
    return;
  }

  // Bounding box of the target nodes in world coordinates.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  for (const node of targets) {
    const width =
      typeof node.style?.width === "number" ? node.style.width : NODE_WIDTH;
    if (node.position.x < minX) {
      minX = node.position.x;
    }
    if (node.position.y < minY) {
      minY = node.position.y;
    }
    if (node.position.x + width > maxX) {
      maxX = node.position.x + width;
    }
  }
  const bboxWidth = maxX - minX;

  // Width-based zoom, clamped.
  const widthFitZoom = rect.width / (bboxWidth * (1 + 2 * HORIZONTAL_PADDING));
  const zoom = Math.max(MIN_ZOOM_FOR_TARGET, Math.min(widthFitZoom, MAX_ZOOM));

  // Horizontally centered on the bbox.
  const centerX = (minX + maxX) / 2;
  // Vertically positioned so `minY` (the top of the topmost target, i.e.
  // the start of its header) lands TOP_MARGIN_PX from the viewport top
  // in screen space.
  const centerY = minY + (rect.height / 2 - TOP_MARGIN_PX) / zoom;

  instance.setCenter(centerX, centerY, { zoom, duration: DURATION_MS });
}
