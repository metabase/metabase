import type { EChartsOption } from "echarts";
import type {
  DatasetOption,
  YAXisOption,
  XAXisOption,
} from "echarts/types/dist/shared";

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

import type { WaterfallChartModel, WaterfallDataset } from "./types";
import { DATASET_DIMENSIONS } from "./constants";
import { getWaterfallExtent } from "./model";

function getXAxisType(settings: ComputedVisualizationSettings) {
  if (settings["graph.x_axis.scale"] === "timeseries") {
    return "time";
  }
  return "category";
}

function getYAxisFormatter(
  translationConstant: number,
  column: DatasetColumn,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
) {
  return (rowValue: RowValue) => {
    const value = checkNumber(rowValue) - translationConstant;

    return renderingContext.formatValue(value, {
      column,
      ...(settings.column?.(column) ?? {}),
      jsx: false,
    });
  };
}

// TODO remove all the typecasts

// TODO before finishing this PR: clean up this func a bit (try not using dot notation), fix type error
export function getWaterfallOption(
  chartModel: WaterfallChartModel,
  timelineEventsModel: TimelineEventsModel | null,
  selectedTimelineEventsIds: TimelineEventId[],
  settings: ComputedVisualizationSettings,
  isAnimated: boolean,
  renderingContext: RenderingContext,
): EChartsOption {
  const option = getCartesianChartOption(
    chartModel,
    timelineEventsModel,
    selectedTimelineEventsIds,
    settings,
    isAnimated,
    renderingContext,
  );

  // dataset
  (option.dataset as DatasetOption[])[0].source = chartModel.dataset;
  (option.dataset as DatasetOption[])[0].dimensions =
    Object.values(DATASET_DIMENSIONS);

  // x-axis
  (option.xAxis as XAXisOption).type = getXAxisType(settings);

  // y-axis
  if (!chartModel.leftAxisModel) {
    throw Error("Missing leftAxisModel");
  }
  chartModel.leftAxisModel.extent = getWaterfallExtent(
    chartModel.dataset as WaterfallDataset,
  );
  const chartMeasurements = getChartMeasurements(
    chartModel,
    settings,
    timelineEventsModel != null,
    renderingContext,
  );
  option.yAxis = buildMetricAxis(
    chartModel.leftAxisModel,
    chartMeasurements.ticksDimensions.yTicksWidthLeft,
    settings,
    "left",
    renderingContext,
  ) as YAXisOption;

  return option;
}
