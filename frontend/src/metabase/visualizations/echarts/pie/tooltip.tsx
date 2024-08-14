import type { TooltipOption } from "echarts/types/dist/shared";
import { renderToString } from "react-dom/server";

import { EChartsTooltip } from "metabase/visualizations/components/ChartTooltip/EChartsTooltip";
import TooltipStyles from "metabase/visualizations/components/ChartTooltip/EChartsTooltip/EChartsTooltip.module.css";
import { getTooltipModel } from "metabase/visualizations/visualizations/PieChart/use-chart-events";

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
): TooltipOption => {
  return {
    trigger: "item",
    appendToBody: true,
    confine: true,
    className: TooltipStyles.ChartTooltipRoot,
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
