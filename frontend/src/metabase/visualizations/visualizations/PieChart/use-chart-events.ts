import type { EChartsType } from "echarts/core";
import { type MutableRefObject, useEffect, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

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
import type {
  PieChartModel,
  PieSlice,
} from "metabase/visualizations/echarts/pie/model/types";
import {
  getMarkerColorClass,
  useClickedStateTooltipSync,
} from "metabase/visualizations/echarts/tooltip";
import type { EChartsSeriesMouseEvent } from "metabase/visualizations/echarts/types";
import { getFriendlyName } from "metabase/visualizations/lib/utils";
import type {
  ClickObject,
  VisualizationProps,
} from "metabase/visualizations/types";
import type { EChartsEventHandler } from "metabase/visualizations/types/echarts";

export const getTooltipModel = (
  hoveredSlice: PieSlice,
  chartModel: PieChartModel,
  formatters: PieChartFormatters,
): EChartsTooltipModel => {
  const rows = (
    hoveredSlice.data.isOther ? chartModel.otherSlices : chartModel.slices
  )
    .filter(slice => slice.data.visible)
    .map(slice => ({
      name: slice.data.name,
      value: slice.data.displayValue,
      color: hoveredSlice.data.isOther ? undefined : slice.data.color,
      formatter: formatters.formatMetric,
    }));

  const rowsTotal = getTotalValue(rows);
  const isShowingTotalSensible = rows.length > 1;

  const formattedRows: EChartsTooltipRow[] = rows.map(row => {
    const markerColorClass = row.color
      ? getMarkerColorClass(row.color)
      : undefined;
    return {
      isFocused:
        !hoveredSlice.data.isOther && row.name === hoveredSlice.data.key,
      markerColorClass,
      name: row.name,
      values: [
        row.formatter(row.value),
        formatPercent(getPercent(chartModel.total, row.value) ?? 0),
      ],
    };
  });

  return {
    header: getFriendlyName(chartModel.colDescs.dimensionDesc.column),
    rows: formattedRows,
    footer: isShowingTotalSensible
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

const hoveredIndexToDataIndex = (index: number, chartModel: PieChartModel) => {
  const baseIndex = index + 1;
  const slicesBefore = chartModel.slices.slice(0, index);
  const hiddenSlicesBefore = slicesBefore.filter(slice => !slice.data.visible);
  return baseIndex - hiddenSlicesBefore.length;
};

function getHoverData(
  event: EChartsSeriesMouseEvent,
  chartModel: PieChartModel,
) {
  if (!event.name) {
    return null;
  }
  const index = chartModel.slices.findIndex(
    slice => slice.data.key === event.name,
  );

  const indexOutOfBounds = chartModel.slices[index] == null;
  if (indexOutOfBounds || chartModel.slices[index].data.noHover) {
    return null;
  }

  return {
    index,
    event: event.event.event,
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
  const slice = chartModel.slices.find(slice => slice.data.key === event.name);
  if (!slice) {
    return;
  }
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
        dataIndex: hoveredIndexToDataIndex(hoveredIndex, chartModel),
        seriesIndex: 0,
      });

      return () => {
        chart.dispatchAction({
          type: "downplay",
          dataIndex: hoveredIndexToDataIndex(hoveredIndex, chartModel),
          seriesIndex: 0,
        });
      };
    },
    [chart, chartModel, hoveredIndex],
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
        handler: (event: EChartsSeriesMouseEvent) => {
          onHoverChange?.(getHoverData(event, chartModel));
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
    ],
  );

  return eventHandlers;
}
