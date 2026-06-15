import type { EChartsType } from "echarts/core";
import { type MutableRefObject, useMemo } from "react";

import { isNative } from "metabase/common/utils/card";
import {
  getNodesFromPath,
  getTreemapRootNodeId,
} from "metabase/visualizations/echarts/graph/treemap/model/tree";
import type {
  TreemapChartColumns,
  TreemapTree,
} from "metabase/visualizations/echarts/graph/treemap/model/types";
import type { EChartsSeriesMouseEvent } from "metabase/visualizations/echarts/types";
import type {
  ClickObject,
  ComputedVisualizationSettings,
  VisualizationProps,
} from "metabase/visualizations/types";
import type { EChartsEventHandler } from "metabase/visualizations/types/echarts";
import type { ClickObjectDimension } from "metabase-lib";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import type { RawSeries, RowValue } from "metabase-types/api";

import {
  type TreemapHoverOverlayRef,
  hideTreemapHoverOverlay,
  showTreemapHoverOverlay,
} from "./overlay";

type TreemapSeriesMouseEvent = EChartsSeriesMouseEvent<{ id?: unknown }>;

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
 * Build a Metabase drill-through `ClickObject` from a clicked tile. The clicked
 * node id ("0" for a 1-level grouping node, "0-1" for a drilled-in leaf) is
 * resolved to its tree path: `path[0]` is the top-level grouping, `path.at(-1)`
 * is the clicked node. The dimensions carry the grouping (and, for a 2-level
 * leaf, the sub-grouping) value so filter/See-records drills work; the value +
 * value column carry the clicked node's metric. Returns `null` when the id
 * doesn't resolve (e.g. a background click). Mirrors Sankey's
 * `createSankeyClickData`: dimensions are omitted for native cards.
 */
export function getTreemapClickData({
  tree,
  id,
  treemapColumns,
  rawSeries,
  settings,
  event,
}: {
  tree: TreemapTree;
  id: string;
  treemapColumns: TreemapChartColumns;
  rawSeries: RawSeries;
  settings: ComputedVisualizationSettings;
  event: TreemapSeriesMouseEvent;
}): ClickObject | null {
  const path = getNodesFromPath(tree, id);
  if (path == null) {
    return null;
  }

  const { grouping, subGrouping, value } = treemapColumns;
  const groupingNode = path[0];
  const clickedNode = path[path.length - 1];
  const isLeafWithSubGrouping = subGrouping != null && path.length > 1;

  const dimensions: ClickObjectDimension[] = [
    { column: grouping.column, value: groupingNode.rawName },
  ];
  if (isLeafWithSubGrouping) {
    dimensions.push({ column: subGrouping.column, value: clickedNode.rawName });
  }

  const columnValues: Record<string, RowValue> = {
    [getColumnKey(grouping.column)]: groupingNode.rawName,
    [getColumnKey(value.column)]: clickedNode.value,
  };
  if (isLeafWithSubGrouping) {
    columnValues[getColumnKey(subGrouping.column)] = clickedNode.rawName;
  }

  const [
    {
      data: { cols },
    },
  ] = rawSeries;

  const clickData: ClickObject = {
    event: event.event.event,
    value: clickedNode.value,
    column: value.column,
    data: cols.map((col) => ({
      col,
      value: columnValues[getColumnKey(col)] ?? null,
      key: col.display_name,
    })),
    settings,
  };

  if (!isNative(rawSeries[0].card)) {
    clickData.dimensions = dimensions;
  }

  return clickData;
}

/**
 * The `click` handler either drills down (zoom) or drills through, depending on
 * state. With sub-grouping, clicking at the overview drills *down* into the
 * clicked element's grouping (ECharts can't natively show two levels initially
 * and drill on click — see option.ts `leafDepth`/`nodeClick` — so native click
 * is disabled and we report the new view root, navigated via
 * `dispatchTreemapViewRoot` in TreemapChart). Once drilled into a group,
 * clicking a leaf tile fires Metabase *drill-through* via `onVisualizationClick`.
 * A 1-level treemap (no sub-grouping) has no zoom, so clicking a node always
 * drills through.
 */
export function getTreemapClickHandler({
  hasChildren,
  isDrilled,
  onDrillToGroup,
  tree,
  treemapColumns,
  rawSeries,
  settings,
  onVisualizationClick,
}: {
  hasChildren: boolean;
  isDrilled: boolean;
  onDrillToGroup: (viewRootId: string) => void;
  tree: TreemapTree;
  treemapColumns: TreemapChartColumns | null;
  rawSeries: RawSeries;
  settings: ComputedVisualizationSettings;
  onVisualizationClick: VisualizationProps["onVisualizationClick"];
}): EChartsEventHandler {
  return {
    eventName: "click",
    handler: (event: TreemapSeriesMouseEvent) => {
      const id = event?.data?.id;
      if (typeof id !== "string") {
        return;
      }
      // Sub-grouping + overview: clicking drills down into the group (unchanged).
      if (hasChildren && !isDrilled) {
        onDrillToGroup(getTreemapRootNodeId(id));
        return;
      }
      // Otherwise the clicked node is a leaf with no further drill-down — a
      // 1-level node, or a leaf inside the drilled-in group — so drill through.
      if (treemapColumns == null) {
        return;
      }
      const clickData = getTreemapClickData({
        tree,
        id,
        treemapColumns,
        rawSeries,
        settings,
        event,
      });
      if (clickData != null) {
        onVisualizationClick?.(clickData);
      }
    },
  };
}

/**
 * The `mouseover` handler washes the hovered tile with a 10% black overlay;
 * `globalout` clears it when the cursor leaves the chart. At the overview the
 * wash covers the hovered element's whole top-level section (its tiles, gaps,
 * and group header); while drilled, where a section fills the canvas, it covers
 * just the hovered leaf tile.
 */
export function getTreemapHoverHandlers({
  chartRef,
  overlayRef,
  isDrilled,
}: {
  chartRef: MutableRefObject<EChartsType | undefined>;
  overlayRef: TreemapHoverOverlayRef;
  isDrilled: boolean;
}): EChartsEventHandler[] {
  return [
    {
      eventName: "mouseover",
      handler: (event: TreemapSeriesMouseEvent) => {
        const id = event?.data?.id;
        if (typeof id !== "string") {
          return;
        }
        // Overview: wash the whole top-level section. Drilled: the section is
        // the canvas, so wash just the hovered tile.
        const targetId = isDrilled ? id : getTreemapRootNodeId(id);
        showTreemapHoverOverlay(chartRef, overlayRef, targetId);
      },
    },
    {
      eventName: "globalout",
      handler: () => hideTreemapHoverOverlay(chartRef, overlayRef),
    },
  ];
}

/** All treemap event handlers: click (drill-down / drill-through) + hover wash. */
export function getTreemapEventHandlers({
  chartRef,
  overlayRef,
  hasChildren,
  isDrilled,
  onDrillToGroup,
  tree,
  treemapColumns,
  rawSeries,
  settings,
  onVisualizationClick,
}: {
  chartRef: MutableRefObject<EChartsType | undefined>;
  overlayRef: TreemapHoverOverlayRef;
  hasChildren: boolean;
  isDrilled: boolean;
  onDrillToGroup: (viewRootId: string) => void;
  tree: TreemapTree;
  treemapColumns: TreemapChartColumns | null;
  rawSeries: RawSeries;
  settings: ComputedVisualizationSettings;
  onVisualizationClick: VisualizationProps["onVisualizationClick"];
}): EChartsEventHandler[] {
  return [
    getTreemapClickHandler({
      hasChildren,
      isDrilled,
      onDrillToGroup,
      tree,
      treemapColumns,
      rawSeries,
      settings,
      onVisualizationClick,
    }),
    ...getTreemapHoverHandlers({
      chartRef,
      overlayRef,
      isDrilled,
    }),
  ];
}

export function useChartEvents({
  chartRef,
  overlayRef,
  hasChildren,
  isDrilled,
  onDrillToGroup,
  tree,
  treemapColumns,
  rawSeries,
  settings,
  onVisualizationClick,
}: {
  chartRef: MutableRefObject<EChartsType | undefined>;
  overlayRef: TreemapHoverOverlayRef;
  hasChildren: boolean;
  isDrilled: boolean;
  onDrillToGroup: (viewRootId: string) => void;
  tree: TreemapTree;
  treemapColumns: TreemapChartColumns | null;
  rawSeries: RawSeries;
  settings: ComputedVisualizationSettings;
  onVisualizationClick: VisualizationProps["onVisualizationClick"];
}) {
  const eventHandlers = useMemo(
    () =>
      getTreemapEventHandlers({
        chartRef,
        overlayRef,
        hasChildren,
        isDrilled,
        onDrillToGroup,
        tree,
        treemapColumns,
        rawSeries,
        settings,
        onVisualizationClick,
      }),
    [
      chartRef,
      overlayRef,
      hasChildren,
      isDrilled,
      onDrillToGroup,
      tree,
      treemapColumns,
      rawSeries,
      settings,
      onVisualizationClick,
    ],
  );

  return { eventHandlers };
}
