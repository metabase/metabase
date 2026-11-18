import type { YAXisOption } from "echarts/types/dist/shared";

import { isNotNull } from "metabase/utils/types";
import type { ColumnSettings } from "metabase-types/api";

import type { ComputedVisualizationSettings, Extent } from "../../../types";
import type { ChartLayout } from "../layout/types";
import { getDatasetExtents } from "../model/dataset";
import type { BaseCartesianChartModel, YAxisModel } from "../model/types";

import { getDurationYAxisTicks } from "./y-axis-ticks";

const DEFAULT_Y_AXIS_SPLIT_NUMBER = 5;

type ChartAxisModels = Pick<
  BaseCartesianChartModel,
  | "leftAxisModel"
  | "rightAxisModel"
  | "splitPanelYAxisModels"
  | "trendLinesModel"
  | "yAxisScaleTransforms"
>;

function getAxisExtent(
  axisModel: YAxisModel,
  chartModel: ChartAxisModels,
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

  const goalValue = settings["graph.goal_value"];
  if (hasGoal && settings["graph.show_goal"] && goalValue != null) {
    const isNormalized = chartModel.leftAxisModel?.isNormalized ?? false;
    includeValue(
      chartModel.yAxisScaleTransforms.toEChartsAxisValue(
        isNormalized ? goalValue / 100 : goalValue,
      ),
    );
  }

  const trendLines = chartModel.trendLinesModel;
  if (trendLines) {
    const trendDataKeys = trendLines.seriesModels
      .filter(({ sourceDataKey }) =>
        axisModel.seriesKeys.includes(sourceDataKey),
      )
      .map(({ dataKey }) => dataKey);
    Object.values(getDatasetExtents(trendDataKeys, trendLines.dataset))
      .flat()
      .forEach(includeValue);
  }
  return [min, max];
}

function isDurationAxis(
  axisModel: YAxisModel,
  columnSettings: ColumnSettings,
  settings: ComputedVisualizationSettings,
) {
  return (
    !axisModel.isNormalized &&
    settings["graph.y_axis.scale"] === "linear" &&
    columnSettings.number_style === "duration"
  );
}

export function applyYAxisTicks(
  axes: YAXisOption[],
  chartModel: ChartAxisModels,
  chartLayout: ChartLayout,
  settings: ComputedVisualizationSettings,
): YAXisOption[] {
  const isSplitPanels = chartLayout.panelHeight != null;
  const axisModels = isSplitPanels
    ? (chartModel.splitPanelYAxisModels ?? [])
    : [chartModel.leftAxisModel, chartModel.rightAxisModel].filter(isNotNull);

  return axes.map((axis, index) => {
    const axisModel = axisModels[index];
    if (axisModel == null || axis.type !== "value") {
      return axis;
    }
    const columnSettings = settings.column?.(axisModel.column) ?? {};
    if (!isDurationAxis(axisModel, columnSettings, settings)) {
      return axis;
    }
    const extent = getAxisExtent(
      axisModel,
      chartModel,
      settings,
      isSplitPanels || index === 0,
    );
    return getDurationYAxisTicks(
      extent,
      axis,
      axisModel.splitNumber ?? DEFAULT_Y_AXIS_SPLIT_NUMBER,
      columnSettings,
    );
  });
}
