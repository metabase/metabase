import type { EChartsType } from "echarts/core";
import { type MutableRefObject, useMemo } from "react";

import type { EChartsEventHandler } from "metabase/visualizations/types/echarts";

type TreemapClickEvent = {
  data?: { id?: unknown };
};

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
 * Treemap click handler: ECharts can't natively show two levels initially and
 * drill on click (see option.ts `leafDepth`/`nodeClick`), so native click is
 * disabled and we report the clicked element's top-level grouping as the new
 * view root. The actual ECharts navigation is driven from that state via
 * `dispatchTreemapViewRoot` (TreemapChart), keeping a single source of truth.
 */
export function getTreemapEventHandlers(
  hasChildren: boolean,
  onDrillToGroup: (viewRootId: string) => void,
): EChartsEventHandler[] {
  if (!hasChildren) {
    return [];
  }

  return [
    {
      eventName: "click",
      handler: (event: TreemapClickEvent) => {
        const id = event?.data?.id;
        if (typeof id !== "string") {
          return;
        }
        onDrillToGroup(getTreemapDrillTargetNodeId(id));
      },
    },
  ];
}

export function useChartEvents(
  hasChildren: boolean,
  onDrillToGroup: (viewRootId: string) => void,
) {
  const eventHandlers = useMemo(
    () => getTreemapEventHandlers(hasChildren, onDrillToGroup),
    [hasChildren, onDrillToGroup],
  );

  return { eventHandlers };
}
