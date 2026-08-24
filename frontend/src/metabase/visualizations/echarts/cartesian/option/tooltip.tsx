import type { TooltipOption } from "echarts/types/dist/shared";

import { reactNodeToHtmlString } from "metabase/utils/react-to-html";
import { getTooltipModel } from "metabase/visualizations/visualizations/CartesianChart/events";
import { EChartsTooltip } from "metabase/viz-core/components/ChartTooltip/EChartsTooltip";
import { GOAL_LINE_SERIES_ID } from "metabase/viz-core/echarts/cartesian/constants/dataset";
import type {
  BaseCartesianChartModel,
  DataKey,
} from "metabase/viz-core/echarts/cartesian/model/types";
import { getTooltipBaseOption } from "metabase/viz-core/echarts/tooltip";
import type { ComputedVisualizationSettings } from "metabase/viz-core/types";
import type { CardDisplayType } from "metabase-types/api";

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
    formatter: (params) => {
      if (Array.isArray(params)) {
        return "";
      }

      const { dataIndex, seriesId } = params;

      if (seriesId === GOAL_LINE_SERIES_ID) {
        return "";
      }

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
