import { useMounted } from "@mantine/hooks";
import cx from "classnames";
import * as d3 from "d3";
import { useCallback, useEffect, useRef } from "react";

import CS from "metabase/css/core/index.css";
import { Box } from "metabase/ui";
import { getFontFamilyValue } from "metabase/utils/fonts";
import { measureTextWidth } from "metabase/utils/measure-text";
import { formatValue } from "metabase/value-formatting";
import { GoalResolvingState } from "metabase/visualizations/components/GoalResolvingState";
import {
  GOAL_WARNING_ICON_SIZE,
  GoalWarningIcon,
} from "metabase/visualizations/components/GoalWarning";
import { useResolvedGoalData } from "metabase/visualizations/hooks/use-resolved-goal-data";
import type { VisualizationProps } from "metabase/visualizations/types";
import { getGoalSegmentBounds, resolveGoalSegments } from "metabase/viz-core";

import { GaugeArc } from "./GaugeArc";
import { GaugeNeedle } from "./GaugeNeedle";
import { GaugeSegmentLabel } from "./GaugeSegmentLabel";
import { HideIfOverflowingSVG } from "./HideIfOverflowingSVG";
import {
  ARC_DEGREES,
  FONT_SIZE_CENTER_LABEL_MAX,
  FONT_SIZE_CENTER_LABEL_MIN,
  FONT_SIZE_SEGMENT_LABEL,
  INNER_RADIUS,
  LABEL_OFFSET_PERCENT,
  MAX_WIDTH,
  MIN_WIDTH_LABEL_THRESHOLD,
  OUTER_RADIUS,
  PADDING_BOTTOM,
  getBackgroundArcColor,
  getCenterLabelColor,
  getSegmentLabelColor,
} from "./constants";
import { GAUGE_CHART_DEFINITION } from "./definition";
import { isGaugeRange } from "./types";
import {
  getGaugeWarnings,
  getLabelBox,
  getSegmentsRange,
  getValue,
  getWarningRadiusClearOfLabels,
  radians,
} from "./utils";

function GaugeComponent({
  className,
  fontFamily,
  isSettings,
  height: heightProp,
  isQueryBuilder,
  series: [{ card, data }],
  settings,
  visualizationIsClickable,
  width,
  onVisualizationClick,
  onHoverChange,
}: VisualizationProps) {
  const { rows, cols } = data;
  const labelRef = useRef<SVGTextElement>(null);
  const isMounted = useMounted();

  const height = heightProp - PADDING_BOTTOM;

  const viewBoxHeight =
    (ARC_DEGREES > 180 ? 50 : 0) + Math.sin(radians(ARC_DEGREES / 2)) * 50;
  const viewBoxWidth = 100;

  const svgAspectRatio = viewBoxHeight / viewBoxWidth;
  const containerAspectRadio = height / width;

  let svgWidth;
  if (containerAspectRadio < svgAspectRatio) {
    svgWidth = Math.min(MAX_WIDTH, height / svgAspectRatio);
  } else {
    svgWidth = Math.min(MAX_WIDTH, width);
  }
  const svgHeight = svgWidth * svgAspectRatio;

  const showLabels = svgWidth > MIN_WIDTH_LABEL_THRESHOLD;

  const goalData = useResolvedGoalData(
    card.dataset_query,
    data,
    getGoalSegmentBounds(settings["gauge.segments"]),
  );
  const segments =
    goalData.status === "resolved"
      ? resolveGoalSegments(goalData.data, settings["gauge.segments"])
      : [];
  const gaugeRange = settings["gauge.range"];
  const range: number[] =
    getSegmentsRange(segments) ?? (isGaugeRange(gaugeRange) ? gaugeRange : []);
  const warnings =
    isQueryBuilder && goalData.status === "resolved" && isGaugeRange(range)
      ? getGaugeWarnings(goalData.results, range)
      : [];

  // value to angle in radians, clamped
  const angle = d3
    .scaleLinear()
    .domain(range) // NOTE: confusing, but the "range" is the domain for the arc scale
    .range([
      ((ARC_DEGREES / 180) * -Math.PI) / 2,
      ((ARC_DEGREES / 180) * Math.PI) / 2,
    ])
    .clamp(true);

  const value = getValue(rows);
  const column = cols[0];

  const valuePosition = (value: number, distance: number): [number, number] => {
    return [
      Math.cos(angle(value) - Math.PI / 2) * distance,
      Math.sin(angle(value) - Math.PI / 2) * distance,
    ];
  };

  // get unique min/max plus range endpoints
  const numberLabels = Array.from(
    new Set(
      range.concat(...segments.map((segment) => [segment.min, segment.max])),
    ),
  );

  const textLabels = segments
    .filter((segment) => segment.label)
    .map((segment) => ({
      label: segment.label,
      value: segment.min + (segment.max - segment.min) / 2,
    }));

  // expand the width to fill available space so that labels don't overflow as often
  const expandWidthFactor = width / svgWidth;
  const svgLeft =
    (width - svgWidth) / 2 -
    // shift to the left the
    (svgWidth * expandWidthFactor - svgWidth) / 2;
  const svgTop = (height - svgHeight) / 2;
  // pixels per viewBox unit
  const svgScale = svgWidth / viewBoxWidth;
  const arcCenterX = (viewBoxWidth * expandWidthFactor) / 2;
  const arcCenterY = 50;
  const columnSettings = column && settings.column && settings.column(column);
  const labelRadius = OUTER_RADIUS * LABEL_OFFSET_PERCENT;
  const warningIconSize = GOAL_WARNING_ICON_SIZE / svgScale;
  // measured at the rendered size, then converted back to viewBox units
  const measureLabelWidth = (text: string) =>
    measureTextWidth(text, {
      family: getFontFamilyValue(fontFamily),
      size: FONT_SIZE_SEGMENT_LABEL * svgScale,
    }) / svgScale;
  const labelBoxes =
    showLabels && warnings.length > 0
      ? [
          ...numberLabels.map((value) => ({
            value,
            text: String(formatValue(value, columnSettings)),
          })),
          ...textLabels.map(({ label, value }) => ({
            value,
            text: label ?? "",
          })),
        ].map(({ value, text }) =>
          getLabelBox(
            valuePosition(value, labelRadius),
            measureLabelWidth(text),
          ),
        )
      : [];

  const updateLabelSize = useCallback(() => {
    const label = labelRef.current;

    if (label) {
      const { width: currentWidth } = label.getBBox();
      // maxWidth currently 95% of inner diameter, could be more intelligent based on text aspect ratio
      const maxWidth = INNER_RADIUS * 2 * 0.95;
      const currentFontSize = parseFloat(
        label.style.fontSize.replace("em", ""),
      );
      // scale the font based on currentWidth/maxWidth, within min and max
      // TODO: if text is too big wrap or ellipsis?
      const desiredFontSize = Math.max(
        FONT_SIZE_CENTER_LABEL_MIN,
        Math.min(
          FONT_SIZE_CENTER_LABEL_MAX,
          currentFontSize * (maxWidth / currentWidth),
        ),
      );
      // don't resize if within 5% to avoid potential thrashing
      if (Math.abs(1 - currentFontSize / desiredFontSize) > 0.05) {
        label.style.fontSize = desiredFontSize + "em";
      }
    }
  }, []);

  useEffect(() => {
    updateLabelSize();
  });

  if (goalData.status === "resolving") {
    return <GoalResolvingState className={className} />;
  }

  return (
    <div className={cx(className, CS.relative)}>
      <div
        className={cx(CS.absolute, CS.overflowHidden)}
        style={{
          width: svgWidth * expandWidthFactor,
          height: svgHeight,
          top: svgTop,
          left: svgLeft,
        }}
      >
        <svg
          viewBox={`0 0 ${viewBoxWidth * expandWidthFactor} ${viewBoxHeight}`}
        >
          <g transform={`translate(${arcCenterX},${arcCenterY})`}>
            {/* BACKGROUND ARC */}
            <GaugeArc
              start={angle(range[0])}
              end={angle(range[1])}
              fill={getBackgroundArcColor()}
            />
            {/* SEGMENT ARCS */}
            {segments.map((segment, index) => (
              <GaugeArc
                column={column}
                end={angle(segment.max)}
                fill={segment.color}
                key={index}
                segment={segment}
                settings={settings}
                start={angle(segment.min)}
                testId={"gauge-arc-" + index}
                visualizationIsClickable={visualizationIsClickable}
                onHoverChange={showLabels ? undefined : onHoverChange}
                onVisualizationClick={onVisualizationClick}
              />
            ))}
            {/* NEEDLE */}
            <GaugeNeedle
              angle={angle(isMounted ? value : 0)}
              isAnimated={!isSettings}
            />
            {/* NUMBER LABELS */}
            {showLabels &&
              numberLabels.map((value, index) => (
                <GaugeSegmentLabel
                  key={index}
                  position={valuePosition(
                    value,
                    OUTER_RADIUS * LABEL_OFFSET_PERCENT,
                  )}
                >
                  {formatValue(value, columnSettings)}
                </GaugeSegmentLabel>
              ))}
            {/* TEXT LABELS */}
            {showLabels &&
              textLabels.map(({ label, value }, index) => (
                <HideIfOverflowingSVG key={index}>
                  <GaugeSegmentLabel
                    position={valuePosition(
                      value,
                      OUTER_RADIUS * LABEL_OFFSET_PERCENT,
                    )}
                    style={{
                      fill: getSegmentLabelColor(),
                    }}
                  >
                    {label}
                  </GaugeSegmentLabel>
                </HideIfOverflowingSVG>
              ))}
            {/* CENTER LABEL */}
            {/* NOTE: can't be a component because ref doesn't work? */}
            <text
              ref={labelRef}
              x={0}
              y={0}
              textAnchor="middle"
              style={{
                fill: getCenterLabelColor(),
                fontSize: "1em",
                fontWeight: "bold",
                transform: "translate(0,0.2em)",
              }}
            >
              {formatValue(value, columnSettings)}
            </text>
          </g>
        </svg>
      </div>
      {warnings.map(({ value, errors }, index) => {
        // labels grow outward from the label radius, so the icon's inner edge sits there too
        const [x, y] = valuePosition(
          value,
          getWarningRadiusClearOfLabels(
            valuePosition(value, 1),
            labelRadius + warningIconSize / 2,
            warningIconSize,
            labelBoxes,
          ),
        );

        return (
          <Box
            key={index}
            pos="absolute"
            left={svgLeft + (arcCenterX + x) * svgScale}
            top={svgTop + (arcCenterY + y) * svgScale}
            style={{ transform: "translate(-50%, -50%)" }}
          >
            <GoalWarningIcon errors={errors} source="color-ranges" />
          </Box>
        );
      })}
    </div>
  );
}

export const Gauge = Object.assign(GaugeComponent, GAUGE_CHART_DEFINITION);
