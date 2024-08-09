import type { TooltipOption } from "echarts/types/dist/shared";
import { renderToString } from "react-dom/server";

import { EChartsTooltip } from "metabase/visualizations/components/ChartTooltip/EChartsTooltip";
import TooltipStyles from "metabase/visualizations/components/ChartTooltip/EChartsTooltip/EChartsTooltip.module.css";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import { getTooltipModel } from "metabase/visualizations/visualizations/CartesianChart/events";

import {
  GOAL_LINE_SERIES_ID,
  TIMELINE_EVENT_SERIES_ID,
} from "../constants/dataset";
import type { BaseCartesianChartModel, DataKey } from "../model/types";

interface ChartItemTooltip {
  dataIndex: number;
  seriesId?: DataKey | null;
  settings: ComputedVisualizationSettings;
  chartModel: BaseCartesianChartModel;
  showMarkers: boolean;
  showPreviousValueComparison: boolean;
}

const ChartItemTooltip = ({
  chartModel,
  settings,
  dataIndex,
  seriesId,
  showMarkers,
  showPreviousValueComparison,
}: ChartItemTooltip) => {
  if (dataIndex == null || seriesId == null) {
    return null;
  }

  const tooltipModel = getTooltipModel(
    chartModel,
    settings,
    dataIndex,
    seriesId,
    showMarkers,
    showPreviousValueComparison,
  );

  if (!tooltipModel) {
    return null;
  }

  return <EChartsTooltip {...tooltipModel} />;
};

export const getTooltipOption = (
  chartModel: BaseCartesianChartModel,
  settings: ComputedVisualizationSettings,
  showMarkers = true,
  showPreviousValueComparison = true,
): TooltipOption => {
  return {
    trigger: "item",
    appendToBody: true,
    className: TooltipStyles.ChartTooltipRoot,
    formatter: params => {
      const isAxisTooltip = Array.isArray(params);

      const dataIndex = isAxisTooltip ? params[0]?.dataIndex : params.dataIndex;
      const seriesId = isAxisTooltip ? null : params.seriesId;

      if (
        seriesId === TIMELINE_EVENT_SERIES_ID ||
        seriesId === GOAL_LINE_SERIES_ID
      ) {
        return "";
      }

      return renderToString(
        <ChartItemTooltip
          settings={settings}
          chartModel={chartModel}
          dataIndex={dataIndex}
          seriesId={seriesId}
          showMarkers={showMarkers}
          showPreviousValueComparison={showPreviousValueComparison}
        />,
      );
    },
  };
};
