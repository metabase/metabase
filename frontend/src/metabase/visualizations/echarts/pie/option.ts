import Color from "color";
import type { EChartsOption, SunburstSeriesOption } from "echarts";

import { getTextColorForBackground } from "metabase/lib/colors";
import { checkNotNull } from "metabase/lib/types";
import { CHAR_ELLIPSES, truncateText } from "metabase/visualizations/lib/text";
import type {
  ComputedVisualizationSettings,
  RenderingContext,
} from "metabase/visualizations/types";

import { DIMENSIONS, OPTION_NAME_SEPERATOR, getTotalText } from "./constants";
import type { PieChartFormatters } from "./format";
import type { PieChartModel, SliceTreeNode } from "./model/types";
import { getArrayFromMapValues, getSliceTreeNodesFromPath } from "./util";
import {
  calcAvailableDonutSliceLabelLength,
  calcInnerOuterRadiusesForRing,
} from "./util/label";

function getTotalGraphicOption(
  settings: ComputedVisualizationSettings,
  chartModel: PieChartModel,
  formatters: PieChartFormatters,
  renderingContext: RenderingContext,
  hoveredIndex: number | undefined,
  hoveredSliceKeyPath: string[] | undefined,
  outerRadius: number,
  innerRadius: number,
) {
  // The font size is technically incorrect for the label text since it uses a
  // smaller font than the value, however using the value font size for
  // measurements makes up for the inaccuracy of our heuristic and provided a
  // good end result.
  const fontStyle = {
    size: DIMENSIONS.total.valueFontSize,
    weight: DIMENSIONS.total.fontWeight,
    family: renderingContext.fontFamily,
  };

  let valueText = "";
  let labelText = "";

  const defaultLabelWillOverflow =
    renderingContext.measureText(getTotalText(), fontStyle) >= innerRadius * 2;

  if (settings["pie.show_total"] && !defaultLabelWillOverflow) {
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
      labelText = getTotalText();
    }

    const valueWillOverflow =
      renderingContext.measureText(
        formatters.formatMetric(sliceValueOrTotal),
        fontStyle,
      ) > outerRadius; // innerRadius technically makes more sense, but looks too narrow in practice      ;

    valueText = truncateText(
      formatters.formatMetric(sliceValueOrTotal, valueWillOverflow),
      innerRadius * 2,
      renderingContext.measureText,
      fontStyle,
    );
    labelText = truncateText(
      labelText,
      innerRadius * 2,
      renderingContext.measureText,
      fontStyle,
    );
  }

  const valueTextWidth = renderingContext.measureText(valueText, fontStyle);
  const labelTextWidth = renderingContext.measureText(labelText, fontStyle);
  const totalWidth = Math.max(valueTextWidth, labelTextWidth);

  const hasSufficientWidth = innerRadius * 2 >= totalWidth;
  if (!hasSufficientWidth) {
    valueText = "";
    labelText = "";
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
  const labelsPosition = chartModel.numRings > 1 ? "radial" : "horizontal";

  function getSeriesData(
    slices: SliceTreeNode[],
    ring = 1,
    parentName: string | null = null,
  ): SunburstSeriesOption["data"] {
    if (slices.length === 0 || innerRadius <= 0 || outerRadius <= 0) {
      return [];
    }

    return slices.map(s => {
      const ringRadiuses = calcInnerOuterRadiusesForRing(
        innerRadius,
        outerRadius,
        chartModel.numRings,
        ring,
      );
      const labelColor = getTextColorForBackground(
        s.color,
        renderingContext.getColor,
      );
      const label = getSliceLabel(s, settings, formatters);
      const availableSpace =
        calcAvailableDonutSliceLabelLength(
          ringRadiuses.inner,
          ringRadiuses.outer,
          s.startAngle,
          s.endAngle,
          fontSize,
          labelsPosition,
        ) -
        2 * DIMENSIONS.slice.label.padding;

      const fontStyle = {
        size: fontSize,
        family: renderingContext.fontFamily,
        weight: DIMENSIONS.slice.label.fontWeight,
      };

      let displayLabel: string | null = null;
      const fullLabelLength = renderingContext.measureText(label, fontStyle);
      if (fullLabelLength <= availableSpace) {
        displayLabel = label;
      } else if (settings["pie.show_labels"]) {
        displayLabel =
          availableSpace > 0
            ? truncateText(
                label,
                availableSpace,
                renderingContext.measureText,
                fontStyle,
              )
            : null;

        displayLabel = displayLabel === CHAR_ELLIPSES ? null : displayLabel;
      }

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
        itemStyle: { color: s.color, borderWidth },
        label: {
          color: labelColor,
          formatter: () => (displayLabel != null ? displayLabel : " "),
          rotate: labelsPosition === "horizontal" ? 0 : "radial",
          verticalAlign: "middle",
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

const getBorderWidth = (innerSideLength: number, ringsCount = 1) => {
  if (ringsCount === 1) {
    // arc length formula: s = 2πr(θ/360°), we want border to be 1 degree
    return (Math.PI * innerSideLength) / DIMENSIONS.slice.borderProportion;
  }
  return 1;
};

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

  const borderWidth = getBorderWidth(innerSideLength, chartModel.numRings);

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
    innerRadius,
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
