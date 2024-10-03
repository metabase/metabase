import type { TooltipOption } from "echarts/types/dist/shared";
import { renderToString } from "react-dom/server";

import { EChartsTooltip } from "metabase/visualizations/components/ChartTooltip/EChartsTooltip";
import { getTooltipModel } from "metabase/visualizations/visualizations/PieChart/use-chart-events";

import { getTooltipBaseOption } from "../tooltip";

import type { PieChartFormatters } from "./format";
import type { PieChartModel } from "./model/types";
import { getSliceKeyPath } from "./util";

interface ChartItemTooltip {
  chartModel: PieChartModel;
  formatters: PieChartFormatters;
  sliceKeyPath: string[];
}

const ChartItemTooltip = ({
  chartModel,
  formatters,
  sliceKeyPath,
}: ChartItemTooltip) => {
  const tooltipModel = getTooltipModel(sliceKeyPath, chartModel, formatters);
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
      // @ts-expect-error - `treePathInfo` is present at runtime, but is not in
      // the type provided by ECharts.
      const sliceKeyPath = getSliceKeyPath(params);

      return renderToString(
        <ChartItemTooltip
          formatters={formatters}
          chartModel={chartModel}
          sliceKeyPath={sliceKeyPath}
        />,
      );
    },
  };
};
