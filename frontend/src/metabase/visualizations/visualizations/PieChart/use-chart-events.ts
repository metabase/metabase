import type { EChartsType } from "echarts/core";
import { type MutableRefObject, useMemo } from "react";
import _ from "underscore";

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
  hoveredIndex: number | null,
  chartModel: PieChartModel,
  formatters: PieChartFormatters,
): StackedTooltipModel => {
  const rows = chartModel.slices.map(slice => ({
    name: formatters.formatDimension(slice.data.key),
    value: slice.data.displayValue,
    color: slice.data.color,
    formatter: formatters.formatMetric,
  }));

  const [headerRows, bodyRows] = _.partition(
    rows,
    (_, index) => index === hoveredIndex,
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

  const slice = chartModel.slices[index];
  if (!slice) {
    // TODO check for `.noHover`
    return null;
  }

  // TODO handle other slice
  // if (slice.data.key === "Other" && others.length > 1) {
  //   return {
  //     index,
  //     event: event && event.nativeEvent,
  //     stackedTooltipModel: getTooltipModel(
  //       others.map(o => ({
  //         ...o,
  //         key: formatDimension(o.key, false),
  //         value: o.displayValue,
  //         color: undefined,
  //       })),
  //       null,
  //       getFriendlyName(cols[dimensionIndex]),
  //       formatDimension,
  //       formatMetric,
  //       total,
  //     ),
  //   };
  // }

  return {
    index,
    event: event.event.event,
    stackedTooltipModel: getTooltipModel(index, chartModel, formatters), // TODO grandTotal
  };
}

export function useChartEvents(
  props: VisualizationProps,
  chartRef: MutableRefObject<EChartsType | undefined>,
  chartModel: PieChartModel,
  formatters: PieChartFormatters,
) {
  const { onHoverChange } = props;
  // useEffect(function handleHoverStates() {}, [props.hovered]);

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
