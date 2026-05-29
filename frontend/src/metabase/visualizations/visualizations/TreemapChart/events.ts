import type { EChartsType } from "echarts/core";
import { type MutableRefObject, useMemo } from "react";

import type { TreemapTree } from "metabase/visualizations/echarts/graph/treemap/model/types";
import type { EChartsEventHandler } from "metabase/visualizations/types/echarts";

type TreemapClickEvent = {
  data?: { id?: unknown };
};

// `treemapRootToNode` event payload. Our own drill dispatches a string id;
// ECharts' native breadcrumb dispatches a zrender tree node (which exposes
// `getId()`).
type TreemapRootToNodeEvent = {
  targetNode?: string | { getId?: () => string } | null;
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
 * Resolve a `treemapRootToNode` payload's `targetNode` to the id of the
 * top-level grouping we are now rooted at, or `null` for the overview (the
 * absolute root, e.g. after clicking the breadcrumb's "All"). Only top-level
 * grouping ids (`"0".."N-1"`) count as a drilled-in view; the absolute root
 * carries an auto-generated id that is not one of ours.
 */
export function getTreemapViewRootId(
  targetNode: TreemapRootToNodeEvent["targetNode"],
  tree: TreemapTree,
): string | null {
  const id =
    typeof targetNode === "string"
      ? targetNode
      : typeof targetNode?.getId === "function"
        ? targetNode.getId()
        : undefined;

  if (id == null || !/^\d+$/.test(id) || Number(id) >= tree.length) {
    return null;
  }
  return id;
}

/**
 * Treemap event handlers:
 * - `click` drills into the grouping the clicked element belongs to. ECharts
 *   can't natively show two levels initially and drill on click (see option.ts
 *   `leafDepth`/`nodeClick`), so we disable native click and dispatch
 *   `treemapRootToNode` ourselves.
 * - `treemaproottonode` tracks the current view root in `viewRootIdRef` so the
 *   tooltip can switch between the overview summary and a drilled-in breakdown.
 *   It is the single source of truth, firing for both our click-drill and the
 *   native breadcrumb (including "All", which resets to the overview).
 */
export function getTreemapEventHandlers(
  chartRef: MutableRefObject<EChartsType | undefined>,
  hasChildren: boolean,
  tree: TreemapTree,
  viewRootIdRef: MutableRefObject<string | null>,
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
    {
      eventName: "treemaproottonode",
      handler: (event: TreemapRootToNodeEvent) => {
        viewRootIdRef.current = getTreemapViewRootId(event?.targetNode, tree);
      },
    },
  ];
}

export function useChartEvents(
  chartRef: MutableRefObject<EChartsType | undefined>,
  hasChildren: boolean,
  tree: TreemapTree,
  viewRootIdRef: MutableRefObject<string | null>,
) {
  const eventHandlers = useMemo(
    () => getTreemapEventHandlers(chartRef, hasChildren, tree, viewRootIdRef),
    [chartRef, hasChildren, tree, viewRootIdRef],
  );

  return { eventHandlers };
}
