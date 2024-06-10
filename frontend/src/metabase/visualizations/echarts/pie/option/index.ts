import type { EChartsOption } from "echarts";
import cloneDeep from "lodash.clonedeep";

import { getTextColorForBackground } from "metabase/lib/colors";
import type {
  ComputedVisualizationSettings,
  Formatter,
  RenderingContext,
} from "metabase/visualizations/types";

import { DIMENSIONS } from "../constants";
import type { PieChartFormatters } from "../format";
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
  const graphicOption = cloneDeep(TOTAL_GRAPHIC_OPTION);

  graphicOption.children.forEach(child => {
    child.style.fontFamily = renderingContext.fontFamily;
  });

  graphicOption.children[0].style.text = formatMetric(total);
  graphicOption.children[0].style.fill = renderingContext.getColor("text-dark");

  graphicOption.children[1].style.fill =
    renderingContext.getColor("text-light");

  return graphicOption;
}

function getRadiusOption(sideLength: number) {
  const outerRadius = sideLength / 2;
  const innerRadius = outerRadius * DIMENSIONS.slice.innerRadiusRatio;

  return [innerRadius, outerRadius];
}

export function getPieChartOption(
  chartModel: PieChartModel,
  formatters: PieChartFormatters,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
  sideLength: number,
): EChartsOption {
  // "Show total" setting
  const graphicOption = settings["pie.show_total"]
    ? getTotalGraphicOption(
        chartModel.total,
        formatters.formatMetric,
        renderingContext,
      )
    : undefined;

  // "Show percentages: On the chart" setting
  const seriesOption = cloneDeep(SUNBURST_SERIES_OPTION); // deep clone to avoid sharing label.formatter with other instances
  if (!seriesOption.label) {
    throw Error(`"seriesOption.label" is undefined`);
  }
  seriesOption.label.formatter = ({ name }) => {
    if (settings["pie.percent_visibility"] !== "inside") {
      return " ";
    }

    return formatters.formatPercent(
      getSliceByKey(name, chartModel.slices).normalizedPercentage,
      "chart",
    );
  };

  // Sizing
  const innerSideLength = Math.min(
    sideLength - DIMENSIONS.padding.side,
    DIMENSIONS.maxSideLength,
  );
  seriesOption.radius = getRadiusOption(innerSideLength);
  seriesOption.itemStyle = {
    borderWidth:
      (Math.PI * innerSideLength) / DIMENSIONS.slice.borderProportion,
  };
  seriesOption.label.fontSize = Math.max(
    DIMENSIONS.slice.maxFontSize * (innerSideLength / DIMENSIONS.maxSideLength),
    DIMENSIONS.slice.minFontSize,
  );

  return {
    animation: false, // TODO when implementing the dynamic pie chart, use animations for opacity transitions, but disable initial animation
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
        label: {
          color: getTextColorForBackground(s.color, renderingContext.getColor),
        },
      })),
    },
  };
}
