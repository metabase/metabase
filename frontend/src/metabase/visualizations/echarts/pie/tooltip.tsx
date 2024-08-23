import type { TooltipOption } from "echarts/types/dist/shared";
import { renderToString } from "react-dom/server";

import { EChartsTooltip } from "metabase/visualizations/components/ChartTooltip/EChartsTooltip";
import { getTooltipModel } from "metabase/visualizations/visualizations/PieChart/use-chart-events";

import { getTooltipBaseOption } from "../tooltip";

import type { PieChartFormatters } from "./format";
import type { PieChartModel } from "./model/types";

interface ChartItemTooltip {
  chartModel: PieChartModel;
  formatters: PieChartFormatters;
  dataIndex: number;
}

const ChartItemTooltip = ({
  chartModel,
  formatters,
  dataIndex,
}: ChartItemTooltip) => {
  const tooltipModel = getTooltipModel(dataIndex, chartModel, formatters);
  return <EChartsTooltip {...tooltipModel} />;
};

export const getTooltipOption = (
  chartModel: PieChartModel,
  formatters: PieChartFormatters,
  containerRef: React.RefObject<HTMLDivElement>,
): TooltipOption => {
  return {
    ...getTooltipBaseOption(containerRef),
    trigger: "item",
    formatter: params => {
      if (Array.isArray(params) || typeof params.dataIndex !== "number") {
        return "";
      }
      return renderToString(
        <ChartItemTooltip
          formatters={formatters}
          chartModel={chartModel}
          dataIndex={params.dataIndex}
        />,
      );
    },
  };
};
