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
import type { TimelineEventId } from "metabase-types/api";

import type { CartesianChartModel } from "../model/types";
import { getCartesianChartOption } from "../option";
import { buildMetricAxis } from "../option/axis";
import { getChartMeasurements } from "../utils/layout";
import type { TimelineEventsModel } from "../timeline-events/types";
import type { WaterfallDataset } from "./types";
import { DATASET_DIMENSIONS } from "./constants";
import { getWaterfallExtent } from "./model";

function getXAxisType(settings: ComputedVisualizationSettings) {
  if (settings["graph.x_axis.scale"] === "timeseries") {
    return "time";
  }
  return "category";
}

// TODO remove all the typecasts
export function getWaterfallOption(
  chartModel: CartesianChartModel,
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
