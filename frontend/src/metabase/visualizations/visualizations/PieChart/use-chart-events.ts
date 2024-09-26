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
import type { PieChartModel } from "metabase/visualizations/echarts/pie/model/types";
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
  dataIndex: number,
  chartModel: PieChartModel,
  formatters: PieChartFormatters,
): EChartsTooltipModel => {
  const hoveredIndex = dataIndexToHoveredIndex(dataIndex, chartModel);
  const hoveredOther =
    chartModel.slices[hoveredIndex].data.isOther &&
    chartModel.otherSlices.length > 1;

  const slices = hoveredOther
    ? chartModel.otherSlices
    : chartModel.slices.filter(slice => slice.data.visible);

  const rows = slices.map(slice => ({
    name: slice.data.name,
    value: slice.data.displayValue,
    color: hoveredOther ? undefined : slice.data.color,
    formatter: formatters.formatMetric,
  }));

  const rowsTotal = getTotalValue(rows);
  const isShowingTotalSensible = rows.length > 1;

  const formattedRows: EChartsTooltipRow[] = rows.map((row, index) => {
    const markerColorClass = row.color
      ? getMarkerColorClass(row.color)
      : undefined;
    return {
      isFocused: !hoveredOther && index === dataIndex - 1,
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

const dataIndexToHoveredIndex = (index: number, chartModel: PieChartModel) => {
  const visibleSlices = chartModel.slices.filter(slice => slice.data.visible);
  const slice = visibleSlices[index - 1];
  const innerIndex = chartModel.slices.findIndex(
    s => s.data.key === slice.data.key && s.data.isOther === slice.data.isOther,
  );
  return innerIndex;
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
  if (event.dataIndex == null) {
    return null;
  }
  const index = dataIndexToHoveredIndex(event.dataIndex, chartModel);

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
  if (!event.dataIndex) {
    return;
  }
  const index = dataIndexToHoveredIndex(event.dataIndex, chartModel);
  const slice = chartModel.slices[index];
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
