import type { EChartsType } from "echarts/core";
import { type MutableRefObject, useEffect, useMemo } from "react";
import { t } from "ttag";

import { formatPercent } from "metabase/static-viz/lib/numbers";
import { checkNotNull } from "metabase/utils/types";
import type {
  EChartsTooltipModel,
  EChartsTooltipRow,
} from "metabase/visualizations/components/ChartTooltip/EChartsTooltip";
import { getTotalValue } from "metabase/visualizations/components/ChartTooltip/StackedDataTooltip/utils";
import type { PieChartFormatters } from "metabase/visualizations/echarts/pie/format";
import type {
  PieChartModel,
  SliceTreeNode,
} from "metabase/visualizations/echarts/pie/model/types";
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
import { getValueFromDimensionKey } from "metabase/visualizations/shared/settings/pie";
import type {
  ClickObject,
  VisualizationProps,
} from "metabase/visualizations/types";
import type { EChartsEventHandler } from "metabase/visualizations/types/echarts";
import type { ClickObjectDimension } from "metabase-lib";
import type { DatasetColumn, RowValue } from "metabase-types/api";

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
    .filter((node) => node.visible)
    .map((slice) => ({
      name: slice.name,
      value: slice.rawValue,
      color: nodes.length === 1 ? slice.color : undefined,
      formatter: formatters.formatMetric,
      key: slice.key,
      normalizedPercentage: slice.normalizedPercentage,
    }));
  const rowsTotal = getTotalValue(rows);

  const formattedRows: EChartsTooltipRow[] = rows.map((row) => {
    const markerColorClass = row.color
      ? getMarkerColorClass(row.color)
      : undefined;
    return {
      isFocused: !sliceTreeNode.isOther && row.key === sliceTreeNode.key,
      markerColorClass,
      name: row.name,
      values: [
        row.formatter(row.value),
        formatPercent(row.normalizedPercentage),
      ],
    };
  });

  return {
    header:
      nodes.length === 1
        ? sliceTreeNode.column?.display_name
        : nodes
            .slice(0, -1)
            .map((node) => node.name)
            .join("  >  "),
    rows: formattedRows,
    footer:
      rows.length > 1
        ? {
            name: t`Total`,
            values: [formatters.formatMetric(rowsTotal), formatPercent(1)],
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

function getNodeColumnIndex(chartModel: PieChartModel, nodeIndex: number) {
  return [
    chartModel.colDescs.dimensionDesc.index,
    chartModel.colDescs.middleDimensionDesc?.index,
    chartModel.colDescs.outerDimensionDesc?.index,
  ][nodeIndex];
}

function hasObjectDimensionValue(
  node: SliceTreeNode,
  nodeIndex: number,
  row: VisualizationProps["data"]["rows"][number] | undefined,
  dataProp: VisualizationProps["data"],
  chartModel: PieChartModel,
) {
  const columnIndex = getNodeColumnIndex(chartModel, nodeIndex);

  if (columnIndex == null) {
    return false;
  }

  const values = node.isOther
    ? getArrayFromMapValues(node.children)
        .map((childNode) => childNode.rowIndex)
        .filter((rowIndex) => rowIndex != null)
        .map((rowIndex) => dataProp.rows[rowIndex]?.[columnIndex])
    : [row?.[columnIndex]];

  return values.some((value) => value != null && typeof value === "object");
}

function getOtherSliceDimensionValue(node: SliceTreeNode): RowValue {
  return getArrayFromMapValues(node.children).map((childNode) =>
    getValueFromDimensionKey(childNode.key),
  );
}

function getDimensionColumn(node: SliceTreeNode): DatasetColumn {
  return checkNotNull(
    node.column ?? getArrayFromMapValues(node.children)[0]?.column,
  );
}

function getClickObjectDimensions(
  nodes: SliceTreeNode[],
): ClickObjectDimension[] {
  return nodes.map((node) => ({
    value: node.isOther
      ? getOtherSliceDimensionValue(node)
      : getValueFromDimensionKey(node.key),
    column: getDimensionColumn(node),
  }));
}

function handleClick(
  event: EChartsSunburstSeriesMouseEvent,
  dataProp: VisualizationProps["data"],
  settings: VisualizationProps["settings"],
  visualizationIsClickable: VisualizationProps["visualizationIsClickable"],
  onVisualizationClick: VisualizationProps["onVisualizationClick"],
  chartModel: PieChartModel,
) {
  if (event.name == null) {
    return;
  }

  const { sliceTreeNode, nodes } = getSliceTreeNodesFromPath(
    chartModel.sliceTree,
    getSliceKeyPath(event),
  );

  const rowIndex = sliceTreeNode.rowIndex;
  const row = rowIndex != null ? dataProp.rows[rowIndex] : undefined;

  // the underlying records filter doesn't support objects, so return early if any of the dimension values are objects
  if (
    nodes.some((node, index) =>
      hasObjectDimensionValue(node, index, row, dataProp, chartModel),
    )
  ) {
    return;
  }

  const data =
    row != null
      ? row.map((value, index) => ({
          value,
          col: dataProp.cols[index],
        }))
      : undefined;

  if (data != null) {
    data[chartModel.colDescs.metricDesc.index].value = sliceTreeNode.rawValue;
  }

  const clickObject: ClickObject = {
    value: sliceTreeNode.value,
    column: chartModel.colDescs.metricDesc.column,
    data,
    dimensions: getClickObjectDimensions(nodes),
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
