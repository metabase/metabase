import Color from "color";
import type { EChartsOption } from "echarts";

import { getTextColorForBackground } from "metabase/lib/colors";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";

import { DIMENSIONS, TOTAL_TEXT } from "./constants";
import type { PieChartFormatters } from "./format";
import type { PieChartModel, PieSlice, PieSliceData } from "./model/types";

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
  settings: ComputedVisualizationSettings,
  chartModel: PieChartModel,
  formatters: PieChartFormatters,
  renderingContext: RenderingContext,
  hoveredIndex: number | undefined,
  outerRadius: number,
) {
  let valueText = "";
  let labelText = "";

  // Don't display any text if there isn't enough width
  const hasSufficientWidth =
    outerRadius * 2 >= DIMENSIONS.totalDiameterThreshold;

  if (hasSufficientWidth && settings["pie.show_total"]) {
    valueText = formatters.formatMetric(
      hoveredIndex != null
        ? chartModel.slices[hoveredIndex].data.displayValue
        : chartModel.total,
    );
    labelText =
      hoveredIndex != null
        ? formatters
            .formatDimension(chartModel.slices[hoveredIndex].data.key)
            .toUpperCase()
        : TOTAL_TEXT;
  }

  return {
    type: "group",
    top: "center",
    left: "center",
    children: [
      {
        type: "text",
        cursor: "text",
        style: {
          fontSize: "22px",
          fontWeight: "700",
          textAlign: "center",
          fontFamily: renderingContext.fontFamily,
          fill: renderingContext.getColor("text-dark"),
          text: valueText,
        },
      },
      {
        type: "text",
        cursor: "text",
        top: 26,
        style: {
          fontSize: "14px",
          fontWeight: "700",
          textAlign: "center",
          fontFamily: renderingContext.fontFamily,
          fill: renderingContext.getColor("text-light"),
          text: labelText,
        },
      },
    ],
  };
}

function getRadiusOption(sideLength: number) {
  const outerRadius = sideLength / 2;
  const innerRadius = outerRadius * DIMENSIONS.slice.innerRadiusRatio;

  return { outerRadius, innerRadius };
}

function getIsLabelVisible(
  label: string,
  slice: PieSlice,
  innerRadius: number,
  outerRadius: number,
  fontSize: number,
  renderingContext: RenderingContext,
) {
  // We use the law of cosines to determine the length of the chord with the
  // same endpoints as the arc. The label should be shorter than this chord, and
  // it should be shorter than the donutWidth.
  //
  // See the following document for a more detailed explanation:
  // https://www.notion.so/metabase/Pie-Chart-Label-Visibility-Explanation-4cf366a78c6a419d95763a431a36b175?pvs=4
  let arcAngle = slice.startAngle - slice.endAngle;
  arcAngle = Math.min(Math.abs(arcAngle), Math.PI - 0.001);

  const innerCircleChordLength = Math.sqrt(
    2 * innerRadius * innerRadius -
      2 * innerRadius * innerRadius * Math.cos(arcAngle),
  );
  const donutWidth = outerRadius - innerRadius;
  const maxLabelDimension = Math.min(innerCircleChordLength, donutWidth);

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
  hoveredIndex?: number,
): EChartsOption {
  // Sizing
  const innerSideLength = Math.min(
    sideLength - DIMENSIONS.padding.side * 2,
    DIMENSIONS.maxSideLength,
  );
  const { outerRadius, innerRadius } = getRadiusOption(innerSideLength);

  const borderWidth =
    (Math.PI * innerSideLength) / DIMENSIONS.slice.borderProportion; // arc length formula: s = 2πr(θ/360°), we want border to be 1 degree

  const fontSize = Math.max(
    DIMENSIONS.slice.maxFontSize * (innerSideLength / DIMENSIONS.maxSideLength),
    DIMENSIONS.slice.minFontSize,
  );

  // "Show total" setting
  const graphicOption = getTotalGraphicOption(
    settings,
    chartModel,
    formatters,
    renderingContext,
    hoveredIndex,
    outerRadius,
  );

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

  // Series data
  const data = chartModel.slices.map(s => {
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
      emphasis: {
        itemStyle: {
          color: s.data.color,
          borderColor: renderingContext.theme.pie.borderColor,
        },
      },
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
  });

  return {
    // Unlike the cartesian chart, `animationDuration: 0` does not prevent the
    // chart from animating on initial render, so we unfortunately have to
    // disable all animations.
    animation: false,
    textStyle: {
      fontFamily: renderingContext.fontFamily,
    },
    graphic: graphicOption,
    series: {
      type: "sunburst",
      sort: undefined,
      nodeClick: false,
      radius: [innerRadius, outerRadius],
      itemStyle: {
        borderWidth,
        borderColor: renderingContext.theme.pie.borderColor,
      },
      label: {
        rotate: 0,
        overflow: "none",
        fontSize,
        fontWeight: DIMENSIONS.slice.label.fontWeight,
      },
      labelLayout: {
        hideOverlap: true,
      },
      data,
    },
  };
}
