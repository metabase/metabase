import type { EChartsOption } from "echarts";

import type {
  ComputedVisualizationSettings,
  Formatter,
  RenderingContext,
} from "metabase/visualizations/types";

import type { PieChartModel } from "../model/types";
import { SUNBURST_SERIES_OPTION, TOTAL_GRAPHIC_OPTION } from "./constants";

function getTotalGraphicOption(
  total: number,
  formatMetric: Formatter,
  renderingContext: RenderingContext,
) {
  const graphicOption = { ...TOTAL_GRAPHIC_OPTION };

  graphicOption.children.forEach(child => {
    child.style.fontFamily = renderingContext.fontFamily;
  });

  graphicOption.children[0].style.text = formatMetric(Math.round(total));
  graphicOption.children[0].style.fill = renderingContext.getColor("text-dark");

  graphicOption.children[1].style.fill =
    renderingContext.getColor("text-light");

  return graphicOption;
}

export function getPieChartOption(
  chartModel: PieChartModel,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
): EChartsOption {
  const { column: getColumnSettings } = settings;
  if (!getColumnSettings) {
    throw Error(`"settings.column" is undefined`);
  }

  const formatMetric = (value: unknown) =>
    renderingContext.formatValue(value, {
      ...getColumnSettings(chartModel.colDescs.metricDesc.column),
    });

  return {
    textStyle: {
      fontFamily: renderingContext.fontFamily,
    },
    graphic: settings["pie.show_total"]
      ? getTotalGraphicOption(chartModel.total, formatMetric, renderingContext)
      : undefined,
    series: {
      ...SUNBURST_SERIES_OPTION,
      data: chartModel.slices.map(s => ({
        value: s.value,
        name: s.key,
        itemStyle: { color: s.color },
      })),
    },
  };
}
