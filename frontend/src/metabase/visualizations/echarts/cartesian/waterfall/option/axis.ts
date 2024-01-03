import { t } from "ttag";
import type { EChartsOption } from "echarts";
import type { XAXisOption, YAXisOption } from "echarts/types/dist/shared";
import dayjs from "dayjs";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";

import type { DatasetColumn, RowValue } from "metabase-types/api";
import { checkNumber } from "metabase/lib/types";

import {
  getAxisNameGap,
  getYAxisRange,
  getAxisNameDefaultOption,
  getTicksDefaultOption,
} from "../../option/axis";
import type { WaterfallChartModel } from "../types";
import { getDimensionDisplayValueGetter } from "../../model/dataset";
import { getWaterfallExtent } from "../model";
import { getChartMeasurements } from "../../utils/layout";
import type { TimelineEventsModel } from "../../timeline-events/types";
import { CHART_STYLE } from "../../constants/style";

function getXAxisType(settings: ComputedVisualizationSettings) {
  if (settings["graph.x_axis.scale"] === "timeseries") {
    return "time";
  }
  return "category";
}

function getXAxisFormatter(
  settings: ComputedVisualizationSettings,
  chartModel: WaterfallChartModel,
  renderingContext: RenderingContext,
) {
  const column = chartModel.dimensionModel.column;
  const valueGetter = getDimensionDisplayValueGetter(chartModel, settings);

  // Value is always converted to a string by ECharts
  return (rawValue: string) => {
    // For timeseries x-axis scale we had to use a date as a placeholder
    // for the dimension value in the dataset, because ECharts does not
    // allow a non-timeseries dimension value when `xAxis.type` is set
    // to `time`. Here we manually replace that placeholder with the
    // "Total" label.
    const isTotalDimension = dayjs(rawValue).isSame(
      dayjs(
        chartModel.waterfallDataset[chartModel.waterfallDataset.length - 1]
          .dimension,
      ),
    );
    if (
      settings["waterfall.show_total"] &&
      settings["graph.x_axis.scale"] === "timeseries" &&
      isTotalDimension
    ) {
      return ` ${t`Total`} `;
    }

    const value = valueGetter(rawValue);
    const formattedValue = renderingContext.formatValue(value, {
      column,
      ...(settings.column?.(column) ?? {}),
      jsx: false,
    });

    return ` ${formattedValue} `; // spaces force padding
  };
}

function getYAxisFormatter(
  negativeTranslation: number,
  column: DatasetColumn,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
) {
  return (rowValue: RowValue) => {
    let value = checkNumber(rowValue) - negativeTranslation;
    if (settings["graph.y_axis.scale"] === "pow") {
      value = value >= 0 ? Math.pow(value, 2) : -Math.pow(value, 2);
    }

    return renderingContext.formatValue(value, {
      column,
      ...(settings.column?.(column) ?? {}),
      jsx: false,
    });
  };
}

function getYAxis(
  settings: ComputedVisualizationSettings,
  chartModel: WaterfallChartModel,
  timelineEventsModel: TimelineEventsModel | null,
  renderingContext: RenderingContext,
): YAXisOption {
  // y-axis
  if (!chartModel.leftAxisModel) {
    throw Error("Missing leftAxisModel");
  }
  chartModel.leftAxisModel.extent = getWaterfallExtent(
    chartModel.waterfallDataset,
  );
  chartModel.leftAxisModel.formatter = getYAxisFormatter(
    chartModel.negativeTranslation,
    chartModel.leftAxisModel.column,
    settings,
    renderingContext,
  );

  const chartMeasurements = getChartMeasurements(
    chartModel,
    settings,
    timelineEventsModel != null,
    renderingContext,
  );
  const nameGap = getAxisNameGap(
    chartMeasurements.ticksDimensions.yTicksWidthLeft,
  );
  const range = getYAxisRange(chartModel.leftAxisModel, settings);
  const axisType = settings["graph.y_axis.scale"] === "log" ? "log" : "value";

  return {
    type: axisType,
    ...range,
    ...getAxisNameDefaultOption(
      renderingContext,
      nameGap,
      chartModel.leftAxisModel.label,
      undefined,
    ),
    splitLine: {
      lineStyle: {
        type: 5,
        color: renderingContext.getColor("border"),
      },
    },
    position: "left",
    axisLine: {
      show: false,
    },
    axisTick: {
      show: false,
    },
    axisLabel: {
      margin: CHART_STYLE.axisTicksMarginY,
      show: !!settings["graph.y_axis.axis_enabled"],
      ...getTicksDefaultOption(renderingContext),
      formatter: getYAxisFormatter(
        chartModel.negativeTranslation,
        chartModel.leftAxisModel.column,
        settings,
        renderingContext,
      ),
    },
  } as YAXisOption;
}

export function getAxes(
  settings: ComputedVisualizationSettings,
  chartModel: WaterfallChartModel,
  timelineEventsModel: TimelineEventsModel | null,
  baseOption: EChartsOption,
  renderingContext: RenderingContext,
) {
  const baseXAxis = baseOption.xAxis;
  if (baseXAxis === undefined || Array.isArray(baseXAxis)) {
    throw TypeError("x-axis option is undefined or an array");
  }

  const xAxis = {
    ...baseXAxis,
    type: getXAxisType(settings),
    axisLabel: {
      ...baseXAxis.axisLabel,
      formatter: getXAxisFormatter(settings, chartModel, renderingContext),
    },
  } as XAXisOption;

  return {
    xAxis,
    yAxis: getYAxis(
      settings,
      chartModel,
      timelineEventsModel,
      renderingContext,
    ),
  };
}
