import Color from "color";
import type { EChartsOption, SunburstSeriesOption } from "echarts";

import { getTextColorForBackground } from "metabase/lib/colors";
import { checkNotNull } from "metabase/lib/types";
import { truncateText } from "metabase/visualizations/lib/text";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";

import { DIMENSIONS, OPTION_NAME_SEPERATOR, TOTAL_TEXT } from "./constants";
import type { PieChartFormatters } from "./format";
import type { PieChartModel, SliceTreeNode } from "./model/types";
import { getArrayFromMapValues, getSliceTreeNodesFromPath } from "./util";

function getTotalGraphicOption(
  settings: ComputedVisualizationSettings,
  chartModel: PieChartModel,
  formatters: PieChartFormatters,
  renderingContext: RenderingContext,
  hoveredIndex: number | undefined,
  hoveredSliceKeyPath: string[] | undefined,
  outerRadius: number,
) {
  let valueText = "";
  let labelText = "";

  // Don't display any text if there isn't enough width
  const hasSufficientWidth = outerRadius * 2 >= DIMENSIONS.total.minWidth;

  if (hasSufficientWidth && settings["pie.show_total"]) {
    let sliceValueOrTotal = 0;

    // chart hovered
    if (hoveredSliceKeyPath != null) {
      const { sliceTreeNode } = getSliceTreeNodesFromPath(
        chartModel.sliceTree,
        hoveredSliceKeyPath,
      );

      sliceValueOrTotal = checkNotNull(sliceTreeNode).displayValue;
      labelText = checkNotNull(sliceTreeNode?.name);

      // legend hovered
    } else if (hoveredIndex != null) {
      const slice = getArrayFromMapValues(chartModel.sliceTree)[hoveredIndex];

      sliceValueOrTotal = slice.displayValue;
      labelText = slice.name.toUpperCase();
    } else {
      sliceValueOrTotal = chartModel.total;
      labelText = TOTAL_TEXT;
    }

    const valueWillOverflow =
      renderingContext.measureText(formatters.formatMetric(sliceValueOrTotal), {
        size: DIMENSIONS.total.valueFontSize,
        family: renderingContext.fontFamily,
        weight: DIMENSIONS.total.fontWeight,
      }) > outerRadius; // innerRadius technically makes more sense, but looks too narrow in practice

    const fontStyle = {
      size: DIMENSIONS.total.valueFontSize,
      weight: DIMENSIONS.total.fontWeight,
      family: renderingContext.fontFamily,
    };

    valueText = truncateText(
      formatters.formatMetric(sliceValueOrTotal, valueWillOverflow),
      outerRadius,
      renderingContext.measureText,
      fontStyle,
    );
    labelText = truncateText(
      labelText,
      outerRadius,
      renderingContext.measureText,
      fontStyle,
    );
  }

  return {
    type: "group",
    top: "center",
    left: "center",
    children: [
      {
        // Value
        type: "text",
        cursor: "text",
        style: {
          fontSize: `${DIMENSIONS.total.valueFontSize}px`,
          fontWeight: "700",
          textAlign: "center",
          fontFamily: renderingContext.fontFamily,
          fill: renderingContext.getColor("text-dark"),
          text: valueText,
        },
      },
      {
        // Label
        type: "text",
        cursor: "text",
        top: 26,
        style: {
          fontSize: `${DIMENSIONS.total.labelFontSize}px`,
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

function getRadiusOption(sideLength: number, chartModel: PieChartModel) {
  let innerRadiusRatio = DIMENSIONS.slice.innerRadiusRatio;
  if (chartModel.numRings === 2) {
    innerRadiusRatio = DIMENSIONS.slice.twoRingInnerRadiusRatio;
  } else if (chartModel.numRings === 3) {
    innerRadiusRatio = DIMENSIONS.slice.threeRingInnerRadiusRatio;
  }

  const outerRadius = sideLength / 2;
  const innerRadius = outerRadius * innerRadiusRatio;

  return { outerRadius, innerRadius };
}

function getSliceLabel(
  slice: SliceTreeNode,
  settings: ComputedVisualizationSettings,
  formatters: PieChartFormatters,
) {
  const name = settings["pie.show_labels"] ? slice.name : undefined;
  const percent =
    settings["pie.percent_visibility"] === "inside" ||
    settings["pie.percent_visibility"] === "both"
      ? formatters.formatPercent(slice.normalizedPercentage, "chart")
      : undefined;

  if (name != null && percent != null) {
    return `${name}: ${percent}`;
  }
  if (name != null) {
    return name;
  }
  if (percent != null) {
    return percent;
  }
  return " ";
}

function getIsLabelVisible(
  label: string,
  slice: SliceTreeNode,
  innerRadius: number,
  outerRadius: number,
  fontSize: number,
  renderingContext: RenderingContext,
  ring: number,
  numRings: number,
) {
  // We use the law of cosines to determine the length of the chord with the
  // same endpoints as the arc. The label should be shorter than this chord, and
  // it should be shorter than the donutWidth.
  //
  // See the following document for a more detailed explanation:
  // https://www.notion.so/metabase/Pie-Chart-Label-Visibility-Explanation-4cf366a78c6a419d95763a431a36b175?pvs=4
  let arcAngle = slice.startAngle - slice.endAngle;
  arcAngle = Math.min(Math.abs(arcAngle), Math.PI - 0.001);

  const donutWidth = (outerRadius - innerRadius) / numRings;
  const ringInnerRadius = innerRadius + donutWidth * (ring - 1);

  const innerCircleChordLength = Math.sqrt(
    2 * ringInnerRadius * ringInnerRadius -
      2 * ringInnerRadius * ringInnerRadius * Math.cos(arcAngle),
  );
  const maxLabelDimension = Math.min(innerCircleChordLength, donutWidth);

  const fontStyle = {
    size: fontSize,
    family: renderingContext.fontFamily,
    weight: DIMENSIONS.slice.label.fontWeight,
  };
  const labelWidth = renderingContext.measureText(label, fontStyle);
  const labelHeight = renderingContext.measureTextHeight(label, fontStyle);

  if (ring === 1) {
    return (
      labelWidth + DIMENSIONS.slice.label.padding <= maxLabelDimension &&
      labelHeight + DIMENSIONS.slice.label.padding <= maxLabelDimension
    );
  }

  return (
    labelWidth + DIMENSIONS.slice.label.padding <= donutWidth &&
    labelHeight + DIMENSIONS.slice.label.padding <= innerCircleChordLength
  );
}

function getSeriesDataFromSlices(
  chartModel: PieChartModel,
  settings: ComputedVisualizationSettings,
  formatters: PieChartFormatters,
  renderingContext: RenderingContext,
  borderWidth: number,
  innerRadius: number,
  outerRadius: number,
  fontSize: number,
): SunburstSeriesOption["data"] {
  function getSeriesData(
    slices: SliceTreeNode[],
    ring = 1,
    parentName: string | null = null,
  ): SunburstSeriesOption["data"] {
    if (slices.length === 0) {
      return [];
    }

    let ringBorderWidth = borderWidth;
    if (ring === 2) {
      ringBorderWidth = DIMENSIONS.slice.twoRingBorderWidth;
    }
    if (ring === 3) {
      ringBorderWidth = DIMENSIONS.slice.threeRingBorderWidth;
    }

    return slices.map(s => {
      const labelColor = getTextColorForBackground(
        s.color,
        renderingContext.getColor,
      );
      const label = getSliceLabel(s, settings, formatters);
      const isLabelVisible = getIsLabelVisible(
        label,
        s,
        innerRadius,
        outerRadius,
        fontSize,
        renderingContext,
        ring,
        chartModel.numRings,
      );

      const name =
        parentName != null
          ? `${parentName}${OPTION_NAME_SEPERATOR}${s.key}`
          : s.key;

      return {
        children: !s.isOther
          ? getSeriesData(getArrayFromMapValues(s.children), ring + 1, name)
          : undefined,
        value: s.value,
        name,
        itemStyle: { color: s.color, borderWidth: ringBorderWidth },
        label: {
          color: labelColor,
          formatter: () => (isLabelVisible ? label : " "),
          rotate: ring === 1 ? 0 : "radial",
        },
        emphasis: {
          itemStyle: {
            color: s.color,
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
            color: Color(s.color).fade(0.7).rgb().string(),
            opacity: 1,
          },
          label: {
            opacity:
              labelColor === renderingContext.getColor("text-dark") ? 0.3 : 1,
          },
        },
      };
    });
  }

  return getSeriesData(
    getArrayFromMapValues(chartModel.sliceTree).filter(s => s.visible),
  );
}

export function getPieChartOption(
  chartModel: PieChartModel,
  formatters: PieChartFormatters,
  settings: ComputedVisualizationSettings,
  renderingContext: RenderingContext,
  sideLength: number,
  hoveredIndex?: number,
  hoveredSliceKeyPath?: string[],
): EChartsOption {
  // Sizing
  const innerSideLength = Math.min(
    sideLength - DIMENSIONS.padding.side * 2,
    DIMENSIONS.maxSideLength,
  );
  const { outerRadius, innerRadius } = getRadiusOption(
    innerSideLength,
    chartModel,
  );

  const borderWidth =
    (Math.PI * innerSideLength) / DIMENSIONS.slice.borderProportion; // arc length formula: s = 2πr(θ/360°), we want border to be 1 degree

  const fontSize =
    chartModel.numRings > 1
      ? DIMENSIONS.slice.multiRingFontSize
      : Math.max(
          DIMENSIONS.slice.maxFontSize *
            (innerSideLength / DIMENSIONS.maxSideLength),
          DIMENSIONS.slice.minFontSize,
        );

  // "Show total" setting
  const graphicOption = getTotalGraphicOption(
    settings,
    chartModel,
    formatters,
    renderingContext,
    hoveredIndex,
    hoveredSliceKeyPath,
    outerRadius,
  );

  // Series data
  const data = getSeriesDataFromSlices(
    chartModel,
    settings,
    formatters,
    renderingContext,
    borderWidth,
    innerRadius,
    outerRadius,
    fontSize,
  );

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
        borderColor: renderingContext.theme.pie.borderColor,
      },
      label: {
        overflow: "none",
        fontSize,
        fontWeight: DIMENSIONS.slice.label.fontWeight,
      },
      labelLayout: {
        hideOverlap: true,
      },
      emphasis: {
        focus: "ancestor",
      },
      data,
    },
  };
}
