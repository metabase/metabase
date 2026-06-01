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

// Minimal shape of the internal ECharts model chain we read to recover the
// treemap series' absolute root node — the same property ECharts itself reads
// when resolving a `treemapRootToNode` action (see retrieveTargetInfo).
type TreemapModelAccessor = {
  getModel?: () =>
    | {
        getSeriesByIndex?: (
          index: number,
        ) =>
          | { getRawData?: () => { tree?: { root?: unknown } } | undefined }
          | undefined;
      }
    | undefined;
};

/**
 * Read the treemap series' absolute root node from the chart instance. Returns
 * `undefined` if the chart isn't ready or the internal shape changed.
 */
export function getTreemapRootNode(chart: EChartsType): unknown {
  return (chart as unknown as TreemapModelAccessor)
    .getModel?.()
    ?.getSeriesByIndex?.(0)
    ?.getRawData?.()?.tree?.root;
}

/**
 * Navigate the treemap back to the overview (absolute root). Dispatching
 * `treemapRootToNode` with the root node fires a `treemaproottonode` event, so
 * the tracked view root resets through the same single source of truth as
 * click-drilling. Used by the breadcrumb's "All".
 */
export function dispatchTreemapToRoot(
  chartRef: MutableRefObject<EChartsType | undefined>,
): void {
  const chart = chartRef.current;
  if (chart == null) {
    return;
  }
  const root = getTreemapRootNode(chart);
  if (root == null) {
    return;
  }
  chart.dispatchAction({
    type: "treemapRootToNode",
    seriesIndex: 0,
    targetNode: root,
  });
}

/**
 * Treemap event handlers:
 * - `click` drills into the grouping the clicked element belongs to. ECharts
 *   can't natively show two levels initially and drill on click (see option.ts
 *   `leafDepth`/`nodeClick`), so we disable native click and dispatch
 *   `treemapRootToNode` ourselves.
 * - `treemaproottonode` reports the current view root via `onViewRootChange` so
 *   the tooltip and breadcrumb can react to drill state. It is the single source
 *   of truth, firing for both our click-drill and the breadcrumb's "All" (which
 *   resets to the overview).
 */
export function getTreemapEventHandlers(
  chartRef: MutableRefObject<EChartsType | undefined>,
  hasChildren: boolean,
  tree: TreemapTree,
  onViewRootChange: (viewRootId: string | null) => void,
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
        onViewRootChange(getTreemapViewRootId(event?.targetNode, tree));
      },
    },
  ];
}

export function useChartEvents(
  chartRef: MutableRefObject<EChartsType | undefined>,
  hasChildren: boolean,
  tree: TreemapTree,
  onViewRootChange: (viewRootId: string | null) => void,
) {
  const eventHandlers = useMemo(
    () =>
      getTreemapEventHandlers(chartRef, hasChildren, tree, onViewRootChange),
    [chartRef, hasChildren, tree, onViewRootChange],
  );

  return { eventHandlers };
}
