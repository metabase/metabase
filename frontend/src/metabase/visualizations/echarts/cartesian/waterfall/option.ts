import type { EChartsOption } from "echarts";
import type { DatasetOption } from "echarts/types/dist/shared";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";
import type { TimelineEventId } from "metabase-types/api";

import type { CartesianChartModel } from "../model/types";
import { getCartesianChartOption } from "../option";
import type { TimelineEventsModel } from "../timeline-events/types";
import { DATASET_DIMENSIONS } from "./constants";

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

  // TODO remove typecast
  (option.dataset as DatasetOption[])[0].dimensions =
    Object.values(DATASET_DIMENSIONS);
  // TODO full yAxis options
  option.yAxis = {
    type: "value",
  };

  return option;
}
