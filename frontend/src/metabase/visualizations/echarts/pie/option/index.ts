import type { EChartsOption } from "echarts";
import { t } from "ttag";

import type {
  ComputedVisualizationSettings,
  Formatter,
  RenderingContext,
} from "metabase/visualizations/types";

import type { PieChartModel } from "../model/types";
import { SUNBURST_SERIES_OPTIONS } from "./constants";

export function getTotalGraphic(
  total: number,
  formatMetric: Formatter,
  renderingContext: RenderingContext,
) {
  const formattedTotal = formatMetric(Math.round(total));

  return {
    type: "group",
    top: "center",
    left: "center",
    children: [
      {
        type: "text",
        cursor: "text",
        style: {
          fill: renderingContext.getColor("text-dark"),
          fontSize: "22px",
          fontFamily: "Lato, sans-serif",
          fontWeight: "700",
          textAlign: "center",
          text: formattedTotal,
        },
      },
      {
        type: "text",
        cursor: "text",
        top: 25, // TODO confirm this and other style values later
        style: {
          fill: renderingContext.getColor("text-light"),
          fontSize: "14px",
          fontFamily: renderingContext.fontFamily,
          fontWeight: "700",
          textAlign: "center",
          text: t`Total`.toUpperCase(),
        },
      },
    ],
  };
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
      ? getTotalGraphic(chartModel.total, formatMetric, renderingContext)
      : undefined,
    series: {
      ...SUNBURST_SERIES_OPTIONS,
      data: chartModel.slices.map(s => ({
        value: s.value,
        name: s.key,
        itemStyle: { color: s.color },
      })),
    },
  };
}
