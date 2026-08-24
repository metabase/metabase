import type { TooltipOption } from "echarts/types/dist/shared";

import { reactNodeToHtmlString } from "metabase/utils/react-to-html";
import { getTooltipModel } from "metabase/visualizations/visualizations/PieChart/use-chart-events";
import { EChartsTooltip } from "metabase/viz-core/components/ChartTooltip/EChartsTooltip";
import type { PieChartFormatters } from "metabase/viz-core/echarts/pie/format";
import type { PieChartModel } from "metabase/viz-core/echarts/pie/model/types";
import { getSliceKeyPath } from "metabase/viz-core/echarts/pie/util";
import { getTooltipBaseOption } from "metabase/viz-core/echarts/tooltip";

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
        />,
      );
    },
  };
};
