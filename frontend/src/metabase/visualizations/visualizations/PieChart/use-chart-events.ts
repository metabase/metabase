import { useMemo } from "react";
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

const getTooltipModel = (
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

function getHoverData(
  event: EChartsSeriesMouseEvent,
  chartModel: PieChartModel,
  formatters: PieChartFormatters,
) {
  if (event.dataIndex == null) {
    return null;
  }
  const index = event.dataIndex - 1;

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
  chartModel: PieChartModel,
  formatters: PieChartFormatters,
) {
  const { onHoverChange } = props;

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
