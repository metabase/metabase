import type { YAXisOption } from "echarts/types/dist/shared";

import { isNotNull } from "metabase/utils/types";

import type { ComputedVisualizationSettings, Extent } from "../../../types";
import type { ChartLayout } from "../layout/types";
import type { BaseCartesianChartModel, YAxisModel } from "../model/types";

import { getGoalLineParams, getGoalLineValue } from "./goal-line";
import { getResponsiveYAxisTicks } from "./y-axis-ticks";

function getAxisExtent(
  axisModel: YAxisModel,
  chartModel: BaseCartesianChartModel,
  settings: ComputedVisualizationSettings,
  hasGoal: boolean,
): Extent {
  let [min, max] = axisModel.extent;
  const includeValue = (value: unknown) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  };

  if (
    hasGoal &&
    settings["graph.show_goal"] &&
    settings["graph.goal_value"] != null
  ) {
    includeValue(
      getGoalLineValue(
        settings["graph.goal_value"],
        getGoalLineParams(chartModel),
      ),
    );
  }

  const trendLines = chartModel.trendLinesModel;
  if (trendLines) {
    for (const { sourceDataKey, dataKey } of trendLines.seriesModels) {
      if (axisModel.seriesKeys.includes(sourceDataKey)) {
        trendLines.extents[dataKey]?.forEach(includeValue);
      }
    }
  }
  return [min, max];
}

export function applyDashboardYAxisTicks(
  axes: YAXisOption[],
  chartModel: BaseCartesianChartModel,
  chartLayout: ChartLayout,
  settings: ComputedVisualizationSettings,
): YAXisOption[] {
  if (settings["graph.y_axis.split_number"] > 0) {
    return axes;
  }

  const isSplitPanels = chartLayout.panelHeight != null;
  const axisModels = isSplitPanels
    ? (chartModel.splitPanelYAxisModels ?? [])
    : [chartModel.leftAxisModel, chartModel.rightAxisModel].filter(isNotNull);
  const height =
    chartLayout.panelHeight ??
    chartLayout.outerHeight -
      chartLayout.padding.top -
      chartLayout.padding.bottom;

  return axes.map((axis, index) => {
    const axisModel = axisModels[index];
    if (!axisModel?.isDashboard || axis.type !== "value") {
      return axis;
    }
    const extent = getAxisExtent(
      axisModel,
      chartModel,
      settings,
      isSplitPanels || index === 0,
    );
    return getResponsiveYAxisTicks(extent, axis, height);
  });
}
