import type { EChartsType } from "echarts/core";
import { type MutableRefObject, useMemo } from "react";

import { isNative } from "metabase/common/utils/card";
import {
  getNodesFromPath,
  getTreemapRootNodeId,
  isOverview,
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
  if (isOverview(viewRootId)) {
    return;
  }
  chartRef.current?.dispatchAction({
    type: "treemapRootToNode",
    seriesIndex: 0,
    targetNode: viewRootId,
  });
}

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

export function getTreemapClickHandler({
  chartRef,
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

      chartRef.current?.dispatchAction({ type: "hideTip" });

      // Sub-grouping + overview
      if (hasChildren && !isDrilled) {
        onDrillToGroup(getTreemapRootNodeId(id));
        return;
      }

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

/* Custom hover overlay. ECharts doesn't support hover overlays on whole groups. */
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
      chartRef,
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
