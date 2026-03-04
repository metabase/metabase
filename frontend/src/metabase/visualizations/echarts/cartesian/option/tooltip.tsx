import type { TooltipOption } from "echarts/types/dist/shared";

import { alpha } from "metabase/lib/colors/palette";
import { reactNodeToHtmlString } from "metabase/lib/react-to-html";
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
    trigger: "axis",
    axisPointer: {
      type: "line",
      lineStyle: {
        type: "solid",
        width: 1,
        color: alpha("black", 0.25),
      },
    },
    formatter: (params) => {
      if (!Array.isArray(params) || params.length === 0) {
        return "";
      }

      // When using axis trigger, params is an array of all series at that axis point
      // We use the first param to get the dataIndex, and find the first non-special series
      const validParam = params.find(
        (param) =>
          param.seriesId !== TIMELINE_EVENT_SERIES_ID &&
          param.seriesId !== GOAL_LINE_SERIES_ID,
      );

      if (!validParam) {
        return "";
      }

      const { dataIndex, seriesId } = validParam;

      return reactNodeToHtmlString(
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
