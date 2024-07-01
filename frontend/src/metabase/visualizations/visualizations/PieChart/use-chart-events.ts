import type { EChartsType } from "echarts/core";
import { type MutableRefObject, useEffect, useMemo } from "react";
import _ from "underscore";

import type { PieChartFormatters } from "metabase/visualizations/echarts/pie/format";
import type { PieChartModel } from "metabase/visualizations/echarts/pie/model/types";
import type { EChartsSeriesMouseEvent } from "metabase/visualizations/echarts/types";
import { getFriendlyName } from "metabase/visualizations/lib/utils";
import type {
  ClickObject,
  StackedTooltipModel,
  VisualizationProps,
} from "metabase/visualizations/types";
import type { EChartsEventHandler } from "metabase/visualizations/types/echarts";

export const getTooltipModel = (
  hoveredIndex: number,
  chartModel: PieChartModel,
  formatters: PieChartFormatters,
): StackedTooltipModel => {
  const hoveredOther =
    chartModel.slices[hoveredIndex].data.isOther &&
    chartModel.otherSlices.length > 1;

  const rows = (hoveredOther ? chartModel.otherSlices : chartModel.slices).map(
    slice => ({
      name: formatters.formatDimension(slice.data.key),
      value: slice.data.displayValue,
      color: hoveredOther ? undefined : slice.data.color,
      formatter: formatters.formatMetric,
    }),
  );

  const [headerRows, bodyRows] = _.partition(
    rows,
    (_, index) => index === (hoveredOther ? null : hoveredIndex),
  );

  return {
    headerTitle: getFriendlyName(chartModel.colDescs.dimensionDesc.column),
    headerRows,
    bodyRows,
    totalFormatter: formatters.formatMetric,
    grandTotal: chartModel.total,
    showTotal: true,
    showPercentages: true,
  };
};

const dataIndexToHoveredIndex = (index: number) => index - 1;
const hoveredIndexToDataIndex = (index: number) => index + 1;

function getHoverData(
  event: EChartsSeriesMouseEvent,
  chartModel: PieChartModel,
  formatters: PieChartFormatters,
) {
  if (event.dataIndex == null) {
    return null;
  }
  const index = dataIndexToHoveredIndex(event.dataIndex);

  const indexOutOfBounds = chartModel.slices[index] == null;
  if (indexOutOfBounds || chartModel.slices[index].data.noHover) {
    return null;
  }

  return {
    index,
    event: event.event.event,
    stackedTooltipModel: getTooltipModel(index, chartModel, formatters),
  };
}

function handleClick(
  event: EChartsSeriesMouseEvent,
  dataProp: VisualizationProps["data"],
  settings: VisualizationProps["settings"],
  visualizationIsClickable: VisualizationProps["visualizationIsClickable"],
  onVisualizationClick: VisualizationProps["onVisualizationClick"],
  chartModel: PieChartModel,
) {
  if (!event.dataIndex) {
    return;
  }
  const slice = chartModel.slices[dataIndexToHoveredIndex(event.dataIndex)];
  const data =
    slice.data.rowIndex != null
      ? dataProp.rows[slice.data.rowIndex].map((value, index) => ({
          value,
          col: dataProp.cols[index],
        }))
      : undefined;

  const clickObject: ClickObject = {
    value: slice.data.value,
    column: chartModel.colDescs.metricDesc.column,
    data,
    dimensions: [
      {
        value: slice.data.key,
        column: chartModel.colDescs.dimensionDesc.column,
      },
    ],
    settings,
    event: event.event.event,
  };

  if (visualizationIsClickable(clickObject) && !slice.data.isOther) {
    onVisualizationClick(clickObject);
  }
}

export function useChartEvents(
  props: VisualizationProps,
  chartRef: MutableRefObject<EChartsType | undefined>,
  chartModel: PieChartModel,
  formatters: PieChartFormatters,
) {
  const {
    onHoverChange,
    data,
    settings,
    visualizationIsClickable,
    onVisualizationClick,
  } = props;
  const hoveredIndex = props.hovered?.index;
  const chart = chartRef?.current;

  useEffect(
    function higlightChartOnLegendHover() {
      if (chart == null || hoveredIndex == null) {
        return;
      }

      chart.dispatchAction({
        type: "highlight",
        dataIndex: hoveredIndexToDataIndex(hoveredIndex),
        seriesIndex: 0,
      });

      return () => {
        chart.dispatchAction({
          type: "downplay",
          dataIndex: hoveredIndexToDataIndex(hoveredIndex),
          seriesIndex: 0,
        });
      };
    },
    [chart, hoveredIndex],
  );

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
        handler: (event: EChartsSeriesMouseEvent) => {
          onHoverChange?.(getHoverData(event, chartModel, formatters));
        },
      },
      {
        eventName: "click",
        query: "series",
        handler: (event: EChartsSeriesMouseEvent) => {
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
      formatters,
    ],
  );

  return eventHandlers;
}
