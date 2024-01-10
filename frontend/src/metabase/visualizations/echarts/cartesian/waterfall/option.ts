import type { EChartsOption } from "echarts";
import type { DatasetOption, YAXisOption } from "echarts/types/dist/shared";

import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type {
  TimelineEventId,
  DatasetColumn,
  RowValue,
} from "metabase-types/api";

import { checkNumber } from "metabase/lib/types";
import { getCartesianChartOption } from "../option";
import { buildMetricAxis } from "../option/axis";
import { getChartMeasurements } from "../utils/layout";
import type { TimelineEventsModel } from "../timeline-events/types";

import type { WaterfallChartModel } from "./types";
import { DATASET_DIMENSIONS } from "./constants";
import { getWaterfallExtent } from "./model";

function getXAxisType(settings: ComputedVisualizationSettings) {
  if (settings["graph.x_axis.scale"] === "timeseries") {
    return "time";
  }
  return "category";
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

export function getWaterfallOption(
  chartModel: WaterfallChartModel,
  timelineEventsModel: TimelineEventsModel | null,
  selectedTimelineEventsIds: TimelineEventId[],
  settings: ComputedVisualizationSettings,
  isAnimated: boolean,
  renderingContext: RenderingContext,
): EChartsOption {
  const baseOption = getCartesianChartOption(
    chartModel,
    timelineEventsModel,
    selectedTimelineEventsIds,
    settings,
    isAnimated,
    renderingContext,
  );

  const dataset: DatasetOption = {
    source: chartModel.dataset,
    dimensions: Object.values(DATASET_DIMENSIONS),
  };
  const xAxisType = getXAxisType(settings);

  // y-axis
  if (!chartModel.leftAxisModel) {
    throw Error("Missing leftAxisModel");
  }
  chartModel.leftAxisModel.extent = getWaterfallExtent(chartModel.dataset);
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
    ...baseOption,
    dataset,
    xAxis: { ...baseOption.xAxis, type: xAxisType },
    yAxis,
  };
}
