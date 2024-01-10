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

import { buildMetricAxis } from "../../option/axis";
import type { WaterfallChartModel } from "../types";
import { getDimensionDisplayValueGetter } from "../../model/dataset";
import { getWaterfallExtent } from "../model";
import { getChartMeasurements } from "../../utils/layout";
import type { TimelineEventsModel } from "../../timeline-events/types";

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
    const value = checkNumber(rowValue) - negativeTranslation;

    return renderingContext.formatValue(value, {
      column,
      ...(settings.column?.(column) ?? {}),
      jsx: false,
    });
  };
}

export function getAxes(
  settings: ComputedVisualizationSettings,
  chartModel: WaterfallChartModel,
  timelineEventsModel: TimelineEventsModel | null,
  baseOption: EChartsOption,
  renderingContext: RenderingContext,
) {
  // x-axis
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
  const yAxis = buildMetricAxis(
    chartModel.leftAxisModel,
    chartMeasurements.ticksDimensions.yTicksWidthLeft,
    settings,
    "left",
    renderingContext,
  ) as YAXisOption;

  return {
    xAxis,
    yAxis,
  };
}
