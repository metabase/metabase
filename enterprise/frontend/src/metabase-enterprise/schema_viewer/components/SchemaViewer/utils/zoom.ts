import type { ReactFlowInstance } from "@xyflow/react";

import { MAX_ZOOM, NODE_WIDTH_PX } from "../constants";
import type { SchemaViewerFlowEdge, SchemaViewerFlowNode } from "../types";

type ZoomTarget = Pick<
  ReactFlowInstance<SchemaViewerFlowNode, SchemaViewerFlowEdge>,
  "setCenter" | "getNodes"
>;

// (if this value changes, update the same constant in e2e/test/scenarios/schema-viewer/schema-viewer.cy.spec.ts)
const MIN_ZOOM_FOR_TARGET = 0.5;
// How far below the viewport's top edge the header of the topmost target
// node should land.
const TOP_MARGIN_PX = 50;
// Fractional horizontal padding applied to the bounding-box width when
// computing the width-based zoom level.
const HORIZONTAL_PADDING = 0.15;
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
export function zoomToNode(instance: ZoomTarget, nodeId: string): boolean {
  if (!nodeId) {
    return false;
  }
  const target = instance.getNodes().find((n) => n.id === nodeId);
  if (!target) {
    return false;
  }

  const viewportEl = document.querySelector(".react-flow");
  const rect = viewportEl?.getBoundingClientRect();
  if (rect == null || rect.width === 0 || rect.height === 0) {
    return false;
  }

  // Bounding box of the target nodes in world coordinates.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  const width =
    typeof target.style?.width === "number"
      ? target.style.width
      : NODE_WIDTH_PX;
  if (target.position.x < minX) {
    minX = target.position.x;
  }
  if (target.position.y < minY) {
    minY = target.position.y;
  }
  if (target.position.x + width > maxX) {
    maxX = target.position.x + width;
  }
  const bboxWidth = maxX - minX;

  const widthBasedZoom =
    rect.width / (bboxWidth * (1 + 2 * HORIZONTAL_PADDING));
  const zoom = Math.max(
    MIN_ZOOM_FOR_TARGET,
    Math.min(widthBasedZoom, MAX_ZOOM),
  );

  // Horizontally centered on the bbox.
  const centerX = (minX + maxX) / 2;
  // Vertically positioned so `minY` (the top of the topmost target, i.e.
  // the start of its header) lands TOP_MARGIN_PX from the viewport top
  // in screen space.
  const centerY = minY + (rect.height / 2 - TOP_MARGIN_PX) / zoom;

  instance.setCenter(centerX, centerY, { zoom, duration: ZOOM_DURATION_MS });
  return true;
}
