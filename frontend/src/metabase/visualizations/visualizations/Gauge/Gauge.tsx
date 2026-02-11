import { useMounted } from "@mantine/hooks";
import cx from "classnames";
import * as d3 from "d3";
import { useCallback, useEffect, useRef } from "react";

import CS from "metabase/css/core/index.css";
import { formatValue } from "metabase/lib/formatting";
import { segmentIsValid } from "metabase/visualizations/lib/utils";
import type { VisualizationProps } from "metabase/visualizations/types";

import { GaugeArc } from "./GaugeArc";
import { GaugeNeedle } from "./GaugeNeedle";
import { GaugeSegmentLabel } from "./GaugeSegmentLabel";
import { HideIfOverflowingSVG } from "./HideIfOverflowingSVG";
import { GAUGE_CHART_DEFINITION } from "./chart-definition";
import {
  ARC_DEGREES,
  FONT_SIZE_CENTER_LABEL_MAX,
  FONT_SIZE_CENTER_LABEL_MIN,
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
import { isGaugeRange, isGaugeSegmentsArray } from "./types";
import { getValue, radians } from "./utils";

Object.assign(Gauge, GAUGE_CHART_DEFINITION);

export function Gauge({
  className,
  isSettings,
  series: [
    {
      data: { rows, cols },
    },
  ],
  settings,
  visualizationIsClickable,
  width,
  onVisualizationClick,
  onHoverChange,
  height: heightProp,
}: VisualizationProps) {
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

  const gaugeRange = settings["gauge.range"];
  const range: number[] = isGaugeRange(gaugeRange) ? gaugeRange : [];
  const gaugeSegments = settings["gauge.segments"];
  const segments = isGaugeSegmentsArray(gaugeSegments)
    ? gaugeSegments.filter((segment) => segmentIsValid(segment))
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
  const columnSettings = column && settings.column && settings.column(column);

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

  return (
    <div className={cx(className, CS.relative)}>
      <div
        className={cx(CS.absolute, CS.overflowHidden)}
        style={{
          width: svgWidth * expandWidthFactor,
          height: svgHeight,
          top: (height - svgHeight) / 2,
          left:
            (width - svgWidth) / 2 -
            // shift to the left the
            (svgWidth * expandWidthFactor - svgWidth) / 2,
        }}
      >
        <svg
          viewBox={`0 0 ${viewBoxWidth * expandWidthFactor} ${viewBoxHeight}`}
        >
          <g
            transform={`translate(${
              (viewBoxWidth * expandWidthFactor) / 2
            },50)`}
          >
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
              style={{
                fill: getCenterLabelColor(),
                fontSize: "1em",
                fontWeight: "bold",
                textAnchor: "middle",
                transform: "translate(0,0.2em)",
              }}
            >
              {formatValue(value, columnSettings)}
            </text>
          </g>
        </svg>
      </div>
    </div>
  );
}
