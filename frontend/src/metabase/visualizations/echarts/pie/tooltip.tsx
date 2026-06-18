import type { TooltipOption } from "echarts/types/dist/shared";

import { reactNodeToHtmlString } from "metabase/utils/react-to-html";
import { EChartsTooltip } from "metabase/visualizations/components/ChartTooltip/EChartsTooltip";
import type { VisualizationProps } from "metabase/visualizations/types";
import { getTooltipModel } from "metabase/visualizations/visualizations/PieChart/use-chart-events";

import { getTooltipBaseOption } from "../tooltip";

import type { PieChartFormatters } from "./format";
import type { PieChartModel } from "./model/types";
import { getSliceKeyPath } from "./util";

interface ChartItemTooltip {
  chartModel: PieChartModel;
  formatters: PieChartFormatters;
  sliceKeyPath: string[];
  settings: VisualizationProps["settings"];
}

const ChartItemTooltip = ({
  chartModel,
  formatters,
  sliceKeyPath,
  settings,
}: ChartItemTooltip) => {
  const tooltipModel = getTooltipModel(
    sliceKeyPath,
    chartModel,
    formatters,
    settings,
  );
  return <EChartsTooltip {...tooltipModel} />;
};

export const getTooltipOption = (
  chartModel: PieChartModel,
  formatters: PieChartFormatters,
  containerRef: React.RefObject<HTMLDivElement>,
  settings: VisualizationProps["settings"],
): TooltipOption => {
  return {
    ...getTooltipBaseOption(containerRef),
    trigger: "item",
    formatter: (params) => {
      if (Array.isArray(params) || typeof params.dataIndex !== "number") {
        return "";
      }
      // @ts-expect-error - `treePathInfo` is present at runtime, but is not in
      // the type provided by ECharts.
      const sliceKeyPath = getSliceKeyPath(params);

      return reactNodeToHtmlString(
        <ChartItemTooltip
          formatters={formatters}
          chartModel={chartModel}
          sliceKeyPath={sliceKeyPath}
          settings={settings}
        />,
      );
    },
  };
};
