import type { TooltipOption } from "echarts/types/dist/shared";

import { reactNodeToHtmlString } from "metabase/lib/react-to-html";
import { EChartsTooltip } from "metabase/visualizations/components/ChartTooltip/EChartsTooltip";
import {
  GOAL_LINE_SERIES_ID,
  TIMELINE_EVENT_SERIES_ID,
} from "metabase/visualizations/echarts/cartesian/constants/dataset";
import { getTooltipBaseOption } from "metabase/visualizations/echarts/tooltip";
import type { ComputedVisualizationSettings } from "metabase/visualizations/types";

import { getBoxPlotTooltipModel } from "../events";
import type { BoxPlotChartModel } from "../model/types";

interface BoxPlotTooltipProps {
  dataIndex: number;
  seriesName?: string;
  seriesId?: string | number;
  dataValue?: unknown;
  settings: ComputedVisualizationSettings;
  chartModel: BoxPlotChartModel;
}

const BoxPlotItemTooltip = ({
  chartModel,
  settings,
  dataIndex,
  seriesName,
  seriesId,
  dataValue,
}: BoxPlotTooltipProps) => {
  if (dataIndex == null) {
    return null;
  }

  const tooltipModel = getBoxPlotTooltipModel(
    chartModel,
    settings,
    dataIndex,
    seriesName,
    seriesId != null ? String(seriesId) : undefined,
    dataValue,
  );

  if (!tooltipModel) {
    return null;
  }

  return <EChartsTooltip {...tooltipModel} />;
};

export const getBoxPlotTooltipOption = (
  chartModel: BoxPlotChartModel,
  settings: ComputedVisualizationSettings,
  containerRef: React.RefObject<HTMLDivElement>,
): TooltipOption => {
  return {
    ...getTooltipBaseOption(containerRef),
    trigger: "item",
    formatter: (params) => {
      if (Array.isArray(params)) {
        return "";
      }

      const { dataIndex, seriesId, seriesName, data } = params;

      if (
        seriesId === TIMELINE_EVENT_SERIES_ID ||
        seriesId === GOAL_LINE_SERIES_ID
      ) {
        return "";
      }

      return reactNodeToHtmlString(
        <BoxPlotItemTooltip
          settings={settings}
          chartModel={chartModel}
          dataIndex={dataIndex}
          seriesName={seriesName}
          seriesId={seriesId}
          dataValue={data}
        />,
      );
    },
  };
};
