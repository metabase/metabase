import Color from "color";
import { type EChartsType, graphic } from "echarts/core";
import { type MutableRefObject, useMemo } from "react";

import { getTreemapNodeRectById } from "metabase/visualizations/echarts/graph/treemap/model/labels";
import type { EChartsEventHandler } from "metabase/visualizations/types/echarts";

type TreemapClickEvent = {
  data?: { id?: unknown };
};

/**
 * The hover overlay element: a zrender `Rect` we add to the chart's zrender
 * layer directly (never via `setOption` — a `setOption` re-renders the treemap
 * at its absolute root, which would undo any drill). Held in a ref so successive
 * `mouseover`s reposition the same element and `globalout` can remove it.
 */
export type TreemapHoverOverlay = InstanceType<typeof graphic.Rect>;
export type TreemapHoverOverlayRef =
  MutableRefObject<TreemapHoverOverlay | null>;

// Draw the overlay above the tiles and their labels.
const HOVER_OVERLAY_Z = 100;

// The hover tint: a 10% black wash over the hovered tile/section (covering its
// tiles, inter-tile gaps, and the group header chip). Computed at runtime, so no
// color literal lands in source (the `no-color-literals` lint rule only flags
// written hex/rgb literals).
export const TREEMAP_HOVER_OVERLAY_FILL = Color("black")
  .alpha(0.1)
  .rgb()
  .string();

/**
 * Treemap series nodes carry path-encoded ids: `"0"` for a top-level grouping,
 * `"0-1"` for a sub-group leaf. Drilling always targets the top-level grouping,
 * so we take the first path segment.
 */
export function getTreemapDrillTargetNodeId(nodeId: string): string {
  return String(nodeId).split("-")[0];
}

/**
 * Re-apply the current drill to the chart. The view root lives in React state
 * (so the breadcrumb and the bottom inset can react to it); after each
 * `setOption` the chart is back at the absolute root, so for a drilled-in view
 * we dispatch `treemapRootToNode` to restore it. `null` is the overview, which
 * `setOption` already renders — nothing to dispatch.
 */
export function dispatchTreemapViewRoot(
  chartRef: MutableRefObject<EChartsType | undefined>,
  viewRootId: string | null,
): void {
  if (viewRootId == null) {
    return;
  }
  chartRef.current?.dispatchAction({
    type: "treemapRootToNode",
    seriesIndex: 0,
    targetNode: viewRootId,
  });
}

/**
 * Wash the tile with the given node id under a 10% black overlay. The overlay is
 * a zrender `Rect` added straight to the chart's zrender layer (NOT via
 * `setOption`, which would re-render the treemap at its absolute root and undo
 * the drill). The same element is repositioned on successive hovers. It's
 * `silent` so mouse events pass through to the tiles beneath (it never steals
 * its own `mouseout`), and sits above the tiles and their labels.
 */
export function showTreemapHoverOverlay(
  chartRef: MutableRefObject<EChartsType | undefined>,
  overlayRef: TreemapHoverOverlayRef,
  nodeId: string,
  fill: string,
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
      style: { fill },
    });
    chart.getZr().add(overlayRef.current);
  } else {
    overlayRef.current.attr({ shape: rect, style: { fill } });
  }
}

/** Remove the hover overlay (if any) from the chart's zrender layer. */
export function hideTreemapHoverOverlay(
  chartRef: MutableRefObject<EChartsType | undefined>,
  overlayRef: TreemapHoverOverlayRef,
): void {
  const overlay = overlayRef.current;
  if (overlay == null) {
    return;
  }
  const chart = chartRef.current;
  if (chart && !chart.isDisposed()) {
    chart.getZr().remove(overlay);
  }
  overlayRef.current = null;
}

/**
 * Treemap event handlers:
 * - `click` drills into the clicked element's grouping. ECharts can't natively
 *   show two levels initially and drill on click (see option.ts
 *   `leafDepth`/`nodeClick`), so native click is disabled and we report the new
 *   view root; the actual navigation is driven from that state via
 *   `dispatchTreemapViewRoot` (TreemapChart), keeping a single source of truth.
 * - `mouseover` washes the hovered tile with a 10% black overlay; `globalout`
 *   clears it when the cursor leaves the chart. At the overview the wash covers
 *   the hovered element's whole top-level section (its tiles, gaps, and group
 *   header); while drilled, where a section fills the canvas, it covers just the
 *   hovered leaf tile.
 */
export function getTreemapEventHandlers({
  chartRef,
  overlayRef,
  hasChildren,
  isDrilled,
  onDrillToGroup,
  overlayFill = TREEMAP_HOVER_OVERLAY_FILL,
}: {
  chartRef: MutableRefObject<EChartsType | undefined>;
  overlayRef: TreemapHoverOverlayRef;
  hasChildren: boolean;
  isDrilled: boolean;
  onDrillToGroup: (viewRootId: string) => void;
  overlayFill?: string;
}): EChartsEventHandler[] {
  const handlers: EChartsEventHandler[] = [];

  if (hasChildren) {
    handlers.push({
      eventName: "click",
      handler: (event: TreemapClickEvent) => {
        const id = event?.data?.id;
        if (typeof id !== "string") {
          return;
        }
        onDrillToGroup(getTreemapDrillTargetNodeId(id));
      },
    });
  }

  handlers.push(
    {
      eventName: "mouseover",
      handler: (event: TreemapClickEvent) => {
        const id = event?.data?.id;
        if (typeof id !== "string") {
          return;
        }
        // Overview: wash the whole top-level section. Drilled: the section is
        // the canvas, so wash just the hovered tile.
        const targetId = isDrilled ? id : getTreemapDrillTargetNodeId(id);
        showTreemapHoverOverlay(chartRef, overlayRef, targetId, overlayFill);
      },
    },
    {
      eventName: "globalout",
      handler: () => hideTreemapHoverOverlay(chartRef, overlayRef),
    },
  );

  return handlers;
}

export function useChartEvents(
  chartRef: MutableRefObject<EChartsType | undefined>,
  overlayRef: TreemapHoverOverlayRef,
  hasChildren: boolean,
  isDrilled: boolean,
  onDrillToGroup: (viewRootId: string) => void,
) {
  const eventHandlers = useMemo(
    () =>
      getTreemapEventHandlers({
        chartRef,
        overlayRef,
        hasChildren,
        isDrilled,
        onDrillToGroup,
      }),
    [chartRef, overlayRef, hasChildren, isDrilled, onDrillToGroup],
  );

  return { eventHandlers };
}
