import type { EChartsOption } from "echarts";

import type {
  ComputedVisualizationSettings,
  Formatter,
  RenderingContext,
} from "metabase/visualizations/types";
import { computeMaxDecimalsForValues } from "metabase/visualizations/lib/utils";

import type { PieChartModel, PieSlice } from "../model/types";
import { SUNBURST_SERIES_OPTION, TOTAL_GRAPHIC_OPTION } from "./constants";

function getSliceByKey(key: string, slices: PieSlice[]) {
  const slice = slices.find(s => s.key === key);
  if (!slice) {
    throw Error(
      `Could not find slice with key ${key} in slices: ${JSON.stringify(
        slices,
      )}`,
    );
  }

  return slice;
}

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
  const metricColSettings = getColumnSettings(
    chartModel.colDescs.metricDesc.column,
  );

  // "Show total" setting
  const formatMetric = (value: unknown) =>
    renderingContext.formatValue(value, {
      ...metricColSettings,
    });

  const graphicOption = settings["pie.show_total"]
    ? getTotalGraphicOption(chartModel.total, formatMetric, renderingContext)
    : undefined;

  // "Show percentages: On the chart" setting
  const formatPercent = (value: unknown) =>
    renderingContext.formatValue(value, {
      column: metricColSettings.column,
      number_separators: metricColSettings.number_separators,
      number_style: "percent",
      jsx: true,
      decimals: computeMaxDecimalsForValues(
        chartModel.slices.map(s => s.normalizedPercentage),
        {
          style: "percent",
          maximumSignificantDigits: 2,
        },
      ),
    });

  const seriesOption = { ...SUNBURST_SERIES_OPTION };
  if (!seriesOption.label) {
    throw Error(`"seriesOption.label" is undefined`);
  }
  seriesOption.label.formatter = ({ name }) => {
    if (settings["pie.percent_visibility"] !== "inside") {
      return " ";
    }

    return formatPercent(
      getSliceByKey(name, chartModel.slices).normalizedPercentage,
    );
  };

  return {
    textStyle: {
      fontFamily: renderingContext.fontFamily,
    },
    graphic: graphicOption,
    series: {
      ...seriesOption,
      data: chartModel.slices.map(s => ({
        value: s.value,
        name: s.key,
        itemStyle: { color: s.color },
      })),
    },
  };
}
