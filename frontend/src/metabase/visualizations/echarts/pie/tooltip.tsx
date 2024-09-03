import type { TooltipOption } from "echarts/types/dist/shared";
import { renderToString } from "react-dom/server";

import { EChartsTooltip } from "metabase/visualizations/components/ChartTooltip/EChartsTooltip";
import { getTooltipModel } from "metabase/visualizations/visualizations/PieChart/use-chart-events";

import { getTooltipBaseOption } from "../tooltip";

import type { PieChartFormatters } from "./format";
import type { PieChartModel, PieSlice } from "./model/types";

interface ChartItemTooltip {
  chartModel: PieChartModel;
  formatters: PieChartFormatters;
  slice: PieSlice;
}

const ChartItemTooltip = ({
  chartModel,
  formatters,
  slice,
}: ChartItemTooltip) => {
  const tooltipModel = getTooltipModel(slice, chartModel, formatters);
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
      if (Array.isArray(params) || !params.name) {
        return "";
      }

      const slice =
        chartModel.slices.find(slice => slice.data.key === params.name) ??
        chartModel.otherSlices.find(slice => slice.data.key === params.name);

      if (slice) {
        return renderToString(
          <ChartItemTooltip
            formatters={formatters}
            chartModel={chartModel}
            slice={slice}
          />,
        );
      } else {
        return "";
      }
    },
  };
};
