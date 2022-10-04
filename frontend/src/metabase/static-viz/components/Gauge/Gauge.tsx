import React, { Fragment } from "react";

import { Pie } from "@visx/shape";
import { Group } from "@visx/group";
import type { PieArcDatum } from "@visx/shape/lib/shapes/Pie";

import { formatNumber } from "metabase/static-viz/lib/numbers";
import { measureText, truncateText } from "metabase/static-viz/lib/text";
import type { ColorGetter } from "metabase/static-viz/lib/colors";

import GaugeNeedle from "./GaugeNeedle";
import { GaugeLabel } from "./GaugeLabel";
import type {
  Card,
  Data,
  GaugeLabelData,
  GaugeSegment,
  Position,
  TextAnchor,
} from "./types";

interface GaugeProps {
  card: Card;
  data: Data;
  getColor: ColorGetter;
}

// Angles
const GAUGE_ARC_ANGLE = Math.PI;

// Margins
const CHART_HORIZONTAL_MARGIN = 10;
const CHART_VERTICAL_MARGIN = 40;
const VALUE_MARGIN = 30;

// Sizes
const CHART_WIDTH = 540;
const GAUGE_THICKNESS = 70;
const MAX_SEGMENT_VALUE_WIDTH = 150;
const GAUGE_OUTER_RADIUS = CHART_WIDTH / 2 - CHART_HORIZONTAL_MARGIN;
const GAUGE_INNER_RADIUS = GAUGE_OUTER_RADIUS - GAUGE_THICKNESS;
const CHART_HEIGHT = GAUGE_OUTER_RADIUS + 2 * CHART_VERTICAL_MARGIN;

// Font
const BASE_FONT_SIZE = 56;
const SEGMENT_LABEL_FONT_SIZE = BASE_FONT_SIZE * 0.3;
const SEGMENT_LABEL_MARGIN = SEGMENT_LABEL_FONT_SIZE;
const DISTANCE_TO_MIDDLE_LABEL_ANCHOR = SEGMENT_LABEL_FONT_SIZE / 2;

// Only allow the bottom of the gauge label to be above the top of the gauge chart.
// So, the labels don't overlap with the gauge chart, otherwise, uses the label position
// as a left or right anchor instead of a middle anchor to avoid having the labels protrude
// the gauge chart.
const SEGMENT_LABEL_ANCHOR_THRESHOLD_ANGLE = Math.acos(
  GAUGE_OUTER_RADIUS / (GAUGE_OUTER_RADIUS + SEGMENT_LABEL_MARGIN),
);

export default function Gauge({ card, data, getColor }: GaugeProps) {
  const settings = card.visualization_settings;
  const gaugeSegmentData = settings["gauge.segments"];

  const gaugeCenterX = CHART_WIDTH / 2;
  const gaugeCenterY = GAUGE_OUTER_RADIUS + CHART_VERTICAL_MARGIN;

  const startAngle = -GAUGE_ARC_ANGLE / 2;
  const endAngle = GAUGE_ARC_ANGLE / 2;

  const gaugeSegmentMinValue = gaugeSegmentData[0].min;
  const gaugeSegmentMaxValue =
    gaugeSegmentData[gaugeSegmentData.length - 1].max;

  const value = data.rows[0][0];
  const gaugeNeedleAngle = limit(
    startAngle +
      calculateRelativeValueAngle(
        value,
        gaugeSegmentMinValue,
        gaugeSegmentMaxValue,
      ),
    startAngle,
    endAngle,
  );
  const gaugeNeedlePosition = getCirclePositionInSvgCoordinate(
    GAUGE_INNER_RADIUS,
    gaugeNeedleAngle,
  );

  const displayValue = formatNumber(value);
  const dynamicValueFontSize = calculateValueFontSize(
    displayValue,
    GAUGE_INNER_RADIUS,
  );

  const gaugeSegmentMinMaxLabels: GaugeLabelData[] = gaugeSegmentData
    .flatMap(gaugeSegmentDatum => {
      return [gaugeSegmentDatum.min, gaugeSegmentDatum.max];
    })
    .reduce(removeDuplicateElements, [])
    .map((gaugeSegmentValue, index, gaugeSegmentValues): GaugeLabelData => {
      const isMinSegmentValue = index === 0;
      const isMaxSegmentValue = index === gaugeSegmentValues.length - 1;
      const gaugeSegmentValueAngle =
        startAngle +
        calculateRelativeValueAngle(
          gaugeSegmentValue,
          gaugeSegmentMinValue,
          gaugeSegmentMaxValue,
        );

      if (isMinSegmentValue) {
        return {
          position: [
            -(GAUGE_INNER_RADIUS + GAUGE_OUTER_RADIUS) / 2,
            SEGMENT_LABEL_MARGIN + DISTANCE_TO_MIDDLE_LABEL_ANCHOR,
          ],
          color: getColor("text-medium"),
          textAnchor: "middle",
          value: formatNumber(gaugeSegmentValue),
        };
      }

      if (isMaxSegmentValue) {
        return {
          position: [
            (GAUGE_INNER_RADIUS + GAUGE_OUTER_RADIUS) / 2,
            SEGMENT_LABEL_MARGIN + DISTANCE_TO_MIDDLE_LABEL_ANCHOR,
          ],
          color: getColor("text-medium"),
          textAnchor: "middle",
          value: formatNumber(gaugeSegmentValue),
        };
      }

      return {
        position: calculateGaugeSegmentLabelPosition(gaugeSegmentValueAngle),
        color: getColor("text-medium"),
        textAnchor: calculateGaugeSegmentLabelTextAnchor(
          gaugeSegmentValueAngle,
        ),
        value: formatNumber(gaugeSegmentValue),
      };
    });

  const gaugeSegmentLabels: GaugeLabelData[] = gaugeSegmentData
    .filter(gaugeSegmentDatum => gaugeSegmentDatum.label)
    .map((gaugeSegmentDatum): GaugeLabelData => {
      const angle =
        startAngle +
        calculateRelativeValueAngle(
          (gaugeSegmentDatum.max + gaugeSegmentDatum.min) / 2,
          gaugeSegmentMinValue,
          gaugeSegmentMaxValue,
        );

      return {
        color: getColor("text-dark"),
        position: calculateGaugeSegmentLabelPosition(angle),
        textAnchor: calculateGaugeSegmentLabelTextAnchor(angle),
        value: truncateText(
          gaugeSegmentDatum.label,
          MAX_SEGMENT_VALUE_WIDTH,
          SEGMENT_LABEL_FONT_SIZE,
        ),
      };
    });

  const gaugeLabels = gaugeSegmentMinMaxLabels.concat(gaugeSegmentLabels);
  const outlineColor = getColor("white");

  return (
    <svg width={CHART_WIDTH} height={CHART_HEIGHT}>
      <g transform={`translate(${CHART_WIDTH / 2}, ${CHART_HEIGHT / 2})`}>
        {/* `transform-origin: center` doesn't work when rendered with Batik.
            This <g /> translates the center of the chart to coordinate (0,0),
            making `scale(number)` using the center of the chart as a transform
            origin similar to `transform-origin: center` */}
        <g
          transform={`scale(${calculateChartScale(gaugeLabels)})
                      translate(${-CHART_WIDTH / 2}, ${-CHART_HEIGHT / 2})`}
        >
          <Group top={gaugeCenterY} left={gaugeCenterX}>
            <Pie
              data={gaugeSegmentData}
              outerRadius={GAUGE_OUTER_RADIUS}
              innerRadius={GAUGE_INNER_RADIUS}
              pieValue={gaugeAccessor}
              pieSort={gaugeSorter}
              startAngle={startAngle}
              endAngle={endAngle}
            >
              {pie => {
                // Renders similar to Pie's default children.
                // https://github.com/airbnb/visx/blob/978c143dae4057e482b0ca909e8c5a16c85dfd1e/packages/visx-shape/src/shapes/Pie.tsx#L86-L98
                return (
                  <Group className="visx-pie-arcs-group">
                    <g key={`pie-arc-base`}>
                      <path
                        className="visx-pie-arc"
                        d={
                          pie.path({
                            startAngle,
                            endAngle,
                          } as unknown as PieArcDatum<GaugeSegment>) || ""
                        }
                        fill={getColor("bg-medium")}
                      />
                    </g>
                    {pie.arcs.map((arc, index) => {
                      return (
                        <g key={`pie-arc-${index}`}>
                          <path
                            className="visx-pie-arc"
                            d={
                              pie.path({
                                ...arc,
                                startAngle:
                                  startAngle +
                                  calculateRelativeValueAngle(
                                    arc.data.min,
                                    gaugeSegmentMinValue,
                                    gaugeSegmentMaxValue,
                                  ),
                                endAngle:
                                  startAngle +
                                  calculateRelativeValueAngle(
                                    arc.data.max,
                                    gaugeSegmentMinValue,
                                    gaugeSegmentMaxValue,
                                  ),
                              }) || ""
                            }
                            fill={colorGetter(arc)}
                          />
                        </g>
                      );
                    })}
                  </Group>
                );
              }}
            </Pie>
            <GaugeNeedle
              color={getColor("bg-dark")}
              outlineColor={outlineColor}
              position={gaugeNeedlePosition}
              valueAngle={gaugeNeedleAngle}
            />
            {gaugeLabels.map(
              ({ color, position, textAnchor, value }, index) => {
                return (
                  <GaugeLabel
                    key={index}
                    fill={color}
                    stroke={outlineColor}
                    fontSize={SEGMENT_LABEL_FONT_SIZE}
                    position={position}
                    label={value}
                    textAnchor={textAnchor}
                  />
                );
              },
            )}
            <GaugeLabel
              fill={getColor("text-dark")}
              stroke={outlineColor}
              fontSize={dynamicValueFontSize}
              position={[0, -GAUGE_INNER_RADIUS * 0.4]}
              label={displayValue}
            />
          </Group>
        </g>
      </g>
    </svg>
  );
}

function calculateRelativeValueAngle(
  value: number,
  minValue: number,
  maxValue: number,
) {
  return ((value - minValue) / (maxValue - minValue)) * GAUGE_ARC_ANGLE;
}

function calculateValueFontSize(displayValue: string, maxWidth: number) {
  let dynamicValueFontSize = BASE_FONT_SIZE;
  while (
    measureText(displayValue, dynamicValueFontSize) >
    2 * (maxWidth - VALUE_MARGIN)
  ) {
    dynamicValueFontSize -= 1;
  }
  return dynamicValueFontSize;
}

function gaugeAccessor(datum: GaugeSegment) {
  return datum.max - datum.min;
}

function gaugeSorter(thisGaugeData: GaugeSegment, thatGaugeData: GaugeSegment) {
  return thisGaugeData.min - thatGaugeData.min;
}

function colorGetter(pieArcDatum: PieArcDatum<GaugeSegment>) {
  return pieArcDatum.data.color;
}

// utils
export function getCirclePositionInSvgCoordinate(
  radius: number,
  angleRadian: number,
): Position {
  return [Math.sin(angleRadian) * radius, -Math.cos(angleRadian) * radius];
}

function calculateChartScale(gaugeLabels: GaugeLabelData[]) {
  const gaugeLabelDimensions = gaugeLabels.map(gaugeLabel => {
    const labelWidth = measureText(gaugeLabel.value, SEGMENT_LABEL_FONT_SIZE);
    function calculateLeftXOffset() {
      switch (gaugeLabel.textAnchor) {
        case "start":
          return 0;
        case "end":
          return labelWidth;
        case "middle":
          return labelWidth / 2;
        default:
          return 0;
      }
    }

    return {
      left: gaugeLabel.position[0] - calculateLeftXOffset(),
      right: gaugeLabel.position[0] + (labelWidth - calculateLeftXOffset()),
    };
  });

  const maxLabelDistanceFromCenter = gaugeLabelDimensions.reduce(
    (currentMaxLabelDistanceFromCenter, gaugeLabelDimension) => {
      return Math.max(
        Math.abs(gaugeLabelDimension.left),
        gaugeLabelDimension.right,
        currentMaxLabelDistanceFromCenter,
      );
    },
    0,
  );

  return Math.min(1, GAUGE_OUTER_RADIUS / maxLabelDistanceFromCenter);
}

function limit(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function calculateGaugeSegmentLabelPosition(angle: number): Position {
  return getCirclePositionInSvgCoordinate(
    GAUGE_OUTER_RADIUS + SEGMENT_LABEL_MARGIN + DISTANCE_TO_MIDDLE_LABEL_ANCHOR,
    angle,
  );
}

function removeDuplicateElements(
  uniqueList: number[],
  element: number,
): number[] {
  if (uniqueList.includes(element)) {
    return uniqueList;
  }

  return uniqueList.concat(element);
}

function calculateGaugeSegmentLabelTextAnchor(angle: number): TextAnchor {
  if (
    isBetweenAngle(angle, -Math.PI / 2, -SEGMENT_LABEL_ANCHOR_THRESHOLD_ANGLE)
  ) {
    return "end";
  }

  if (
    isBetweenAngle(
      angle,
      -SEGMENT_LABEL_ANCHOR_THRESHOLD_ANGLE,
      SEGMENT_LABEL_ANCHOR_THRESHOLD_ANGLE,
    )
  ) {
    return "middle";
  }

  return "start";
}

const CIRCLE_ANGLE = 2 * Math.PI;
function isBetweenAngle(
  angle: number,
  fromAngle: number,
  toAngle: number,
): boolean {
  const normalizedAngle = normalizeAngle(angle);
  const normalizedFromAngle = normalizeAngle(fromAngle);
  const normalizedToAngle = normalizeAngle(toAngle);
  if (normalizedToAngle < normalizedFromAngle) {
    return (
      (normalizedAngle >= normalizedFromAngle &&
        normalizedAngle <= CIRCLE_ANGLE) ||
      (normalizedAngle >= 0 && normalizedAngle <= normalizedToAngle)
    );
  }
  return (
    normalizedAngle >= normalizedFromAngle &&
    normalizedAngle <= normalizedToAngle
  );
}

/**
 * @returns angle in positive radian
 */
function normalizeAngle(angle: number) {
  const maybeNegativeAngle = angle % CIRCLE_ANGLE;
  return (maybeNegativeAngle + CIRCLE_ANGLE) % CIRCLE_ANGLE;
}
