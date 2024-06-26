import Color from "color";
import type d3 from "d3";
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
import type { PieChartModel, PieSlice, PieSliceData } from "../model/types";

import { SUNBURST_SERIES_OPTION, TOTAL_GRAPHIC_OPTION } from "./constants";

function getSliceByKey(key: PieSliceData["key"], slices: PieSlice[]) {
  const slice = slices.find(s => s.data.key === key);
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

  return { outerRadius, innerRadius };
}

function getIsLabelVisible(
  label: string,
  slice: d3.layout.pie.Arc<PieSliceData>,
  innerRadius: number,
  outerRadius: number,
  fontSize: number,
  renderingContext: RenderingContext,
) {
  const donutWidth = outerRadius - innerRadius;
  const arcAngle = slice.startAngle - slice.endAngle;

  // using law of cosines to calculate the arc length
  // c = sqrt(a^2 + b^2﹣2*a*b * cos(arcAngle))
  // where a = b = innerRadius
  const innerRadiusArcDistance = Math.sqrt(
    2 * innerRadius * innerRadius -
      2 * innerRadius * innerRadius * Math.cos(arcAngle),
  );

  const maxLabelDimension = Math.min(innerRadiusArcDistance, donutWidth);

  const fontStyle = {
    size: fontSize,
    family: renderingContext.fontFamily,
    weight: DIMENSIONS.slice.label.fontWeight,
  };
  const labelWidth = renderingContext.measureText(label, fontStyle);
  const labelHeight = renderingContext.measureTextHeight(label, fontStyle);

  return (
    labelWidth + DIMENSIONS.slice.label.padding <= maxLabelDimension &&
    labelHeight + DIMENSIONS.slice.label.padding <= maxLabelDimension
  );
}

export function getPieChartOption(
  chartModel: PieChartModel,
  formatters: PieChartFormatters,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
  sideLength: number,
): EChartsOption {
  // Sizing
  const seriesOption = cloneDeep(SUNBURST_SERIES_OPTION); // deep clone to avoid sharing assigned with other instances
  if (!seriesOption.label) {
    throw Error(`"seriesOption.label" is undefined`);
  }

  const innerSideLength = Math.min(
    sideLength - DIMENSIONS.padding.side * 2,
    DIMENSIONS.maxSideLength,
  );
  const { outerRadius, innerRadius } = getRadiusOption(innerSideLength);
  seriesOption.radius = [innerRadius, outerRadius];

  seriesOption.itemStyle = {
    borderWidth:
      (Math.PI * innerSideLength) / DIMENSIONS.slice.borderProportion, // arc length formula: s = 2πr(θ/360°), we want border to be 1 degree
  };

  const fontSize = Math.max(
    DIMENSIONS.slice.maxFontSize * (innerSideLength / DIMENSIONS.maxSideLength),
    DIMENSIONS.slice.minFontSize,
  );
  seriesOption.label.fontSize = fontSize;

  // "Show total" setting
  const graphicOption = settings["pie.show_total"]
    ? getTotalGraphicOption(
        chartModel.total,
        formatters.formatMetric,
        renderingContext,
      )
    : undefined;

  // "Show percentages: On the chart" setting
  const formatSlicePercent = (key: PieSliceData["key"]) => {
    if (settings["pie.percent_visibility"] !== "inside") {
      return " ";
    }

    return formatters.formatPercent(
      getSliceByKey(key, chartModel.slices).data.normalizedPercentage,
      "chart",
    );
  };

  return {
    animation: false, // TODO when implementing the dynamic pie chart, use animations for opacity transitions, but disable initial animation
    textStyle: {
      fontFamily: renderingContext.fontFamily,
    },
    graphic: graphicOption,
    series: {
      ...seriesOption,
      data: chartModel.slices.map(s => {
        const labelColor = getTextColorForBackground(
          s.data.color,
          renderingContext.getColor,
        );
        const label = formatSlicePercent(s.data.key);
        const isLabelVisible = getIsLabelVisible(
          label,
          s,
          innerRadius,
          outerRadius,
          fontSize,
          renderingContext,
        );

        return {
          value: s.data.value,
          name: s.data.key,
          itemStyle: { color: s.data.color },
          label: {
            color: labelColor,
            formatter: () => (isLabelVisible ? label : " "),
          },
          emphasis: { itemStyle: { color: s.data.color } },
          blur: {
            itemStyle: {
              // We have to fade the slices through `color` rather than `opacity`
              // becuase echarts' will apply the opacity to the white border,
              // causing the underlying color to leak. It is safe to use non-hex
              // values here, since this value will never be used in batik
              // (there's no emphasis/blur for static viz).
              color: Color(s.data.color).fade(0.7).rgb().string(),
              opacity: 1,
            },
            label: {
              opacity:
                labelColor === renderingContext.getColor("text-dark") ? 0.3 : 1,
            },
          },
        };
      }),
    },
  };
}
