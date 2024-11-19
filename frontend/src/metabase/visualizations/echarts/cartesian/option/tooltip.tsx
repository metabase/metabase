import type { TooltipOption } from "echarts/types/dist/shared";
import { renderToString } from "react-dom/server";

import { EChartsTooltip } from "metabase/visualizations/components/ChartTooltip/EChartsTooltip";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";
import { getTooltipModel } from "metabase/visualizations/visualizations/CartesianChart/events";
import type { CardDisplayType } from "metabase-types/api";

import { getTooltipBaseOption } from "../../tooltip";
import {
  GOAL_LINE_SERIES_ID,
  TIMELINE_EVENT_SERIES_ID,
} from "../constants/dataset";
import type { BaseCartesianChartModel, DataKey } from "../model/types";

interface ChartItemTooltip {
  dataIndex: number;
  display: CardDisplayType;
  seriesId?: DataKey | null;
  settings: ComputedVisualizationSettings;
  chartModel: BaseCartesianChartModel;
}

const ChartItemTooltip = ({
  chartModel,
  settings,
  dataIndex,
  display,
  seriesId,
}: ChartItemTooltip) => {
  if (dataIndex == null || seriesId == null) {
    return null;
  }

  const tooltipModel = getTooltipModel(
    chartModel,
    settings,
    dataIndex,
    display,
    seriesId,
  );

  if (!tooltipModel) {
    return null;
  }

  return <EChartsTooltip {...tooltipModel} />;
};

export const getTooltipOption = (
  chartModel: BaseCartesianChartModel,
  settings: ComputedVisualizationSettings,
  display: CardDisplayType,
  containerRef: React.RefObject<HTMLDivElement>,
): TooltipOption => {
  return {
    ...getTooltipBaseOption(containerRef),
    trigger: "item",
    formatter: params => {
      if (Array.isArray(params)) {
        return "";
      }

      const { dataIndex, seriesId } = params;

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
          display={display}
          seriesId={seriesId}
        />,
      );
    },
  };
};
