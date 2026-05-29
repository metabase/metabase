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
 * Click-to-drill handler. ECharts can't natively show two levels initially and
 * drill on click (see option.ts `leafDepth`/`nodeClick`), so we disable native
 * click and dispatch `treemapRootToNode` ourselves, drilling into the grouping
 * the clicked element belongs to. Back-navigation is handled by ECharts'
 * native breadcrumb.
 */
export function getTreemapEventHandlers(
  chartRef: MutableRefObject<EChartsType | undefined>,
  hasChildren: boolean,
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
        chartRef.current?.dispatchAction({
          type: "treemapRootToNode",
          seriesIndex: 0,
          targetNode: getTreemapDrillTargetNodeId(id),
        });
      },
    },
  ];
}

export function useChartEvents(
  chartRef: MutableRefObject<EChartsType | undefined>,
  hasChildren: boolean,
) {
  const eventHandlers = useMemo(
    () => getTreemapEventHandlers(chartRef, hasChildren),
    [chartRef, hasChildren],
  );

  return { eventHandlers };
}
