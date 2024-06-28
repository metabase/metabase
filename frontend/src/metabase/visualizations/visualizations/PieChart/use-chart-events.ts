import type { EChartsType } from "echarts/core";
import { type MutableRefObject, useEffect, useMemo } from "react";
import _ from "underscore";

import { OTHER_SLICE_KEY } from "metabase/visualizations/echarts/pie/constants";
import type { PieChartFormatters } from "metabase/visualizations/echarts/pie/format";
import type { PieChartModel } from "metabase/visualizations/echarts/pie/model/types";
import type { EChartsSeriesMouseEvent } from "metabase/visualizations/echarts/types";
import { getFriendlyName } from "metabase/visualizations/lib/utils";
import type {
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
    chartModel.slices[hoveredIndex].data.key === OTHER_SLICE_KEY &&
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
  if (indexOutOfBounds) {
    return null;
  }

  return {
    index,
    event: event.event.event,
    stackedTooltipModel: getTooltipModel(index, chartModel, formatters),
  };
}

export function useChartEvents(
  props: VisualizationProps,
  chartRef: MutableRefObject<EChartsType | undefined>,
  chartModel: PieChartModel,
  formatters: PieChartFormatters,
) {
  const { onHoverChange } = props;
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
    ],
    [onHoverChange, chartModel, formatters],
  );

  return eventHandlers;
}
