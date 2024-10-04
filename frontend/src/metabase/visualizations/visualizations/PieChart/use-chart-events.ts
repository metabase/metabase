import type { EChartsType } from "echarts/core";
import { type MutableRefObject, useEffect, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import { checkNotNull } from "metabase/lib/types";
import { formatPercent } from "metabase/static-viz/lib/numbers";
import type {
  EChartsTooltipModel,
  EChartsTooltipRow,
} from "metabase/visualizations/components/ChartTooltip/EChartsTooltip";
import {
  getPercent,
  getTotalValue,
} from "metabase/visualizations/components/ChartTooltip/StackedDataTooltip/utils";
import type { PieChartFormatters } from "metabase/visualizations/echarts/pie/format";
import type { PieChartModel } from "metabase/visualizations/echarts/pie/model/types";
import type { EChartsSunburstSeriesMouseEvent } from "metabase/visualizations/echarts/pie/types";
import {
  getArrayFromMapValues,
  getSliceKeyPath,
  getSliceTreeNodesFromPath,
} from "metabase/visualizations/echarts/pie/util";
import {
  getMarkerColorClass,
  useClickedStateTooltipSync,
} from "metabase/visualizations/echarts/tooltip";
import { getFriendlyName } from "metabase/visualizations/lib/utils";
import type {
  ClickObject,
  VisualizationProps,
} from "metabase/visualizations/types";
import type { EChartsEventHandler } from "metabase/visualizations/types/echarts";

export const getTooltipModel = (
  sliceKeyPath: string[],
  chartModel: PieChartModel,
  formatters: PieChartFormatters,
): EChartsTooltipModel => {
  const { sliceTreeNode, nodes } = getSliceTreeNodesFromPath(
    chartModel.sliceTree,
    sliceKeyPath,
  );
  const siblingNodes = getArrayFromMapValues(
    nodes.length >= 2 ? nodes[nodes.length - 2].children : chartModel.sliceTree,
  );

  const rows = (
    sliceTreeNode.isOther
      ? getArrayFromMapValues(sliceTreeNode.children)
      : siblingNodes
  )
    .filter(node => node.visible)
    .map(slice => ({
      name: slice.name,
      value: slice.displayValue,
      color: nodes.length === 1 ? slice.color : undefined,
      formatter: formatters.formatMetric,
      key: slice.key,
    }));
  const rowsTotal = getTotalValue(rows);

  const formattedRows: EChartsTooltipRow[] = rows.map(row => {
    const markerColorClass = row.color
      ? getMarkerColorClass(row.color)
      : undefined;
    return {
      isFocused: !sliceTreeNode.isOther && row.key === sliceTreeNode.key,
      markerColorClass,
      name: row.name,
      values: [
        row.formatter(row.value),
        formatPercent(getPercent(chartModel.total, row.value) ?? 0),
      ],
    };
  });

  return {
    header:
      nodes.length === 1
        ? getFriendlyName(sliceTreeNode.column)
        : nodes
            .slice(0, -1)
            .map(node => node.name)
            .join("  >  "),
    rows: formattedRows,
    footer:
      rows.length > 1
        ? {
            name: t`Total`,
            values: [
              formatters.formatMetric(rowsTotal),
              formatPercent(getPercent(chartModel.total, rowsTotal) ?? 0),
            ],
          }
        : undefined,
  };
};

function getHoverData(
  event: EChartsSunburstSeriesMouseEvent,
  chartModel: PieChartModel,
) {
  if (event.dataIndex == null) {
    return null;
  }

  const pieSliceKeyPath = getSliceKeyPath(event);

  const dimensionNode = chartModel.sliceTree.get(pieSliceKeyPath[0]);
  if (dimensionNode == null) {
    throw Error(`Could not find dimensionNode for key ${pieSliceKeyPath[0]}`);
  }

  return {
    index: dimensionNode.legendHoverIndex,
    event: event.event.event,
    pieSliceKeyPath,
  };
}

function handleClick(
  event: EChartsSunburstSeriesMouseEvent,
  dataProp: VisualizationProps["data"],
  settings: VisualizationProps["settings"],
  visualizationIsClickable: VisualizationProps["visualizationIsClickable"],
  onVisualizationClick: VisualizationProps["onVisualizationClick"],
  chartModel: PieChartModel,
) {
  if (event.dataIndex == null) {
    return;
  }

  const { sliceTreeNode, nodes } = getSliceTreeNodesFromPath(
    chartModel.sliceTree,
    getSliceKeyPath(event),
  );

  if (sliceTreeNode.isOther) {
    return;
  }

  const rowIndex = sliceTreeNode.rowIndex;

  const data =
    rowIndex != null
      ? dataProp.rows[rowIndex].map((value, index) => ({
          value,
          col: dataProp.cols[index],
        }))
      : undefined;

  if (data != null) {
    data[chartModel.colDescs.metricDesc.index].value = sliceTreeNode.value;
  }

  const clickObject: ClickObject = {
    value: sliceTreeNode.value,
    column: chartModel.colDescs.metricDesc.column,
    data,
    dimensions: nodes.map(node => ({
      value: node.key,
      column: checkNotNull(node.column),
    })),
    settings,
    event: event.event.event,
  };

  if (visualizationIsClickable(clickObject)) {
    onVisualizationClick(clickObject);
  }
}

export function useChartEvents(
  props: VisualizationProps,
  chartRef: MutableRefObject<EChartsType | undefined>,
  chartModel: PieChartModel,
) {
  const {
    onHoverChange,
    data,
    settings,
    visualizationIsClickable,
    onVisualizationClick,
  } = props;
  // We use `pieLegendHoverIndex` instead of `hovered.index` because we only
  // want to manually highlight and downplay when the user hovers over the
  // legend. If the user hovers over the chart, echarts will handle highlighting
  // the chart itself.
  const legendHoverIndex = props.hovered?.pieLegendHoverIndex;
  const chart = chartRef?.current;

  useEffect(
    function higlightChartOnLegendHover() {
      if (chart == null || legendHoverIndex == null) {
        return;
      }

      const name = getArrayFromMapValues(chartModel.sliceTree)[legendHoverIndex]
        .key;

      chart.dispatchAction({
        type: "highlight",
        name,
        seriesIndex: 0,
      });

      return () => {
        chart.dispatchAction({
          type: "downplay",
          name,
          seriesIndex: 0,
        });
      };
    },
    [chart, chartModel, legendHoverIndex],
  );

  useClickedStateTooltipSync(chartRef.current, props.clicked);

  const eventHandlers: EChartsEventHandler[] = useMemo(
    () => [
      {
        eventName: "mouseout",
        query: "series",
        handler: () => {
          onHoverChange?.(null);
        },
      },
      {
        eventName: "mousemove",
        query: "series",
        handler: (event: EChartsSunburstSeriesMouseEvent) => {
          onHoverChange?.(getHoverData(event, chartModel));
        },
      },
      {
        eventName: "click",
        query: "series",
        handler: (event: EChartsSunburstSeriesMouseEvent) => {
          handleClick(
            event,
            data,
            settings,
            visualizationIsClickable,
            onVisualizationClick,
            chartModel,
          );
        },
      },
    ],
    [
      onHoverChange,
      data,
      settings,
      visualizationIsClickable,
      onVisualizationClick,
      chartModel,
    ],
  );

  return eventHandlers;
}
