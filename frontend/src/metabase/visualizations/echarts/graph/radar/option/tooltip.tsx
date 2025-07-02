import type { TooltipOption } from "echarts/types/dist/shared";
import type { RefObject } from "react";

import { reactNodeToHtmlString } from "metabase/lib/react-to-html";
import {
  EChartsTooltip,
  type EChartsTooltipRow,
} from "metabase/visualizations/components/ChartTooltip/EChartsTooltip";
import {
  getMarkerColorClass,
  getTooltipBaseOption,
} from "metabase/visualizations/echarts/tooltip";
import { getColorsForValues } from "metabase/lib/colors/charts";

import type { RadarChartModel } from "../model/types";

interface ChartItemTooltipProps {
  chartModel: RadarChartModel;
  params: any;
}

const ChartItemTooltip = ({ chartModel, params }: ChartItemTooltipProps) => {
  const { formatters, radarColumns } = chartModel;

  if (!radarColumns || !params.data) {
    return null;
  }

  const { name, value } = params.data;
  
  const colors = getColorsForValues(
    radarColumns.metrics.map((metric) => metric.display_name || metric.name),
  );

  const rows: EChartsTooltipRow[] = value
    .map((val: number | null, index: number) => {
      if (val == null) {
        return null;
      }
      const metricName =
        radarColumns.metrics[index]?.display_name ||
        radarColumns.metrics[index]?.name;
      const formattedValue = formatters.metrics[index](val);
      const color = colors[metricName];
      
      return {
        name: metricName,
        values: [formattedValue],
        markerColorClass: getMarkerColorClass(color),
      };
    })
    .filter((row): row is EChartsTooltipRow => row !== null);

  return <EChartsTooltip header={name} rows={rows} />;
};

export const getTooltipOption = (
  containerRef: RefObject<HTMLDivElement>,
  chartModel: RadarChartModel,
): TooltipOption => {
  return {
    ...getTooltipBaseOption(containerRef),
    trigger: "item",
    formatter: (params: any) => {
      if (Array.isArray(params)) {
        return "";
      }

      return reactNodeToHtmlString(
        <ChartItemTooltip params={params} chartModel={chartModel} />,
      );
    },
  };
};