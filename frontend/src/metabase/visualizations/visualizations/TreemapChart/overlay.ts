import type { MutableRefObject } from "react";

import {
  type EChartsType,
  HOVER_OVERLAY_Z,
  TREEMAP_HOVER_OVERLAY_FILL,
  getTreemapNodeRectById,
  graphic,
} from "metabase/viz-core";

export type TreemapHoverOverlay = InstanceType<typeof graphic.Rect>;
export type TreemapHoverOverlayRef =
  MutableRefObject<TreemapHoverOverlay | null>;

export function showTreemapHoverOverlay(
  chartRef: MutableRefObject<EChartsType | undefined>,
  overlayRef: TreemapHoverOverlayRef,
  nodeId: string,
): void {
  const chart = chartRef.current;
  if (!chart) {
    return;
  }
  const rect = getTreemapNodeRectById(chart, nodeId);
  if (!rect) {
    return;
  }
  if (overlayRef.current == null) {
    overlayRef.current = new graphic.Rect({
      silent: true,
      z: HOVER_OVERLAY_Z,
      shape: rect,
      style: { fill: TREEMAP_HOVER_OVERLAY_FILL },
    });
    chart.getZr().add(overlayRef.current);
  } else {
    overlayRef.current.attr({
      shape: rect,
      style: { fill: TREEMAP_HOVER_OVERLAY_FILL },
    });
  }
}

export function hideTreemapHoverOverlay(
  chartRef: MutableRefObject<EChartsType | undefined>,
  overlayRef: TreemapHoverOverlayRef,
): void {
  const overlay = overlayRef.current;
  if (overlay === null) {
    return;
  }
  const chart = chartRef.current;
  if (chart && !chart.isDisposed()) {
    chart.getZr().remove(overlay);
  }
  overlayRef.current = null;
}
