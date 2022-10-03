import React, { ComponentProps, Fragment } from "react";

import { Pie } from "@visx/shape";
import { Group } from "@visx/group";
import type { PieArcDatum } from "@visx/shape/lib/shapes/Pie";

import { formatNumber } from "metabase/static-viz/lib/numbers";
import { measureText } from "metabase/static-viz/lib/text";
import type { ColorGetter } from "metabase/static-viz/lib/colors";
import OutlinedText from "../Text/OutlinedText";

type Position = [x: number, y: number];

interface GaugeSegment {
  min: number;
  max: number;
  color: string;
  label: string;
}

interface GaugeVisualizationSettings {
  "gauge.segments": GaugeSegment[];
}

interface Card {
  visualization_settings: GaugeVisualizationSettings;
}

type GaugeData = [number];

interface Data {
  rows: [GaugeData];
}

interface GaugeProps {
  card: Card;
  data: Data;
  getColor: ColorGetter;
}

type TextAnchor = ComponentProps<typeof OutlinedText>["textAnchor"];

interface GaugeLabelData {
  position: Position;
  textAnchor: TextAnchor;
  value: string;
  color: string;
}

const ARC_DEGREE = 180;
const HORIZONTAL_MARGIN = 20;
const VERTICAL_MARGIN = HORIZONTAL_MARGIN * 2;
const WIDTH = 540;
const VALUE_MARGIN = WIDTH * 0.1;
const GAUGE_OUTER_RADIUS = WIDTH / 2 - HORIZONTAL_MARGIN;
const HEIGHT = GAUGE_OUTER_RADIUS + 2 * VERTICAL_MARGIN;
const GAUGE_THICKNESS = 70;
const BASE_FONT_SIZE = GAUGE_THICKNESS * 0.8;
const SEGMENT_LABEL_FONT_SIZE = BASE_FONT_SIZE * 0.3;
// TODO: Make this dynamic and calculated from font size,
const THRESHOLD_ANGLE_DEGREE = toRadian(30);

export default function Gauge({ card, data, getColor }: GaugeProps) {
  const settings = card.visualization_settings;
  const gaugeSegmentData = settings["gauge.segments"];
  const centerX = WIDTH / 2;
  const centerY = GAUGE_OUTER_RADIUS + VERTICAL_MARGIN;
  const gaugeOuterRadius = GAUGE_OUTER_RADIUS;
  const gaugeInnerRadius = gaugeOuterRadius - GAUGE_THICKNESS;
  const startAngle = Math.PI + toRadian((360 - ARC_DEGREE) / 2);
  const endAngle = startAngle + toRadian(ARC_DEGREE);

  const minValue = gaugeSegmentData[0].min;
  const maxValue = gaugeSegmentData[gaugeSegmentData.length - 1].max;
  const value = data.rows[0][0];
  const valueAngle =
    startAngle + calculateValueAngle(value, minValue, maxValue);

  const valuePosition = getCirclePositionInSvgCoordinate(
    gaugeInnerRadius,
    valueAngle,
  );
  const displayValue = formatNumber(value);
  const dynamicValueFontSize = calculateValueFontSize(
    displayValue,
    gaugeInnerRadius,
  );

  function calculatePosition(fontSize: number, angle: number) {
    const labelMargin = fontSize / 2;
    const distanceToMiddleLabelAnchor = fontSize / 2;
    return getCirclePositionInSvgCoordinate(
      gaugeOuterRadius + labelMargin + distanceToMiddleLabelAnchor,
      angle,
    );
  }
  const outlineColor = getColor("white");

  const gaugeSegmentMinMaxLabels: GaugeLabelData[] = gaugeSegmentData.flatMap(
    (gaugeSegmentDatum, index): GaugeLabelData | GaugeLabelData[] => {
      const fontSize = BASE_FONT_SIZE * 0.3;
      const isFirstSegment = index === 0;
      const isLastSegment = index === gaugeSegmentData.length - 1;
      const minAngle =
        startAngle +
        calculateValueAngle(gaugeSegmentDatum.min, minValue, maxValue);
      const minPosition: Position = isFirstSegment
        ? [-(gaugeInnerRadius + gaugeOuterRadius) / 2, fontSize]
        : calculatePosition(fontSize, minAngle);
      const maxPosition: Position | undefined = isLastSegment
        ? [(gaugeInnerRadius + gaugeOuterRadius) / 2, fontSize]
        : undefined;

      function calculateLabelTextAnchor(angle: number): TextAnchor {
        const normalizedMinAngle = normalizeAngle(angle);

        if (
          isBetweenAngle(
            normalizedMinAngle,
            1.5 * Math.PI,
            normalizeAngle(toRadian(-THRESHOLD_ANGLE_DEGREE)),
          )
        ) {
          return "end";
        }

        if (
          isBetweenAngle(
            normalizedMinAngle,
            normalizeAngle(toRadian(-THRESHOLD_ANGLE_DEGREE)),
            normalizeAngle(toRadian(THRESHOLD_ANGLE_DEGREE)),
          )
        ) {
          return "middle";
        }

        return "start";
      }
      if (maxPosition) {
        return [
          {
            position: minPosition,
            color: getColor("text-medium"),
            textAnchor: calculateLabelTextAnchor(minAngle),
            value: formatNumber(gaugeSegmentDatum.min),
          },
          {
            position: maxPosition,
            color: getColor("text-medium"),
            textAnchor: isLastSegment
              ? calculateLabelTextAnchor(minAngle)
              : "middle",
            value: formatNumber(gaugeSegmentDatum.max),
          },
        ];
      }

      return {
        position: minPosition,
        color: getColor("text-medium"),
        textAnchor: isFirstSegment
          ? "middle"
          : calculateLabelTextAnchor(minAngle),
        value: formatNumber(gaugeSegmentDatum.min),
      };
    },
  );

  const gaugeSegmentLabels: GaugeLabelData[] = gaugeSegmentData
    .filter(gaugeSegmentDatum => gaugeSegmentDatum.label)
    .map((gaugeSegmentDatum, index): GaugeLabelData => {
      const gaugeSegmentLabel = gaugeSegmentDatum.label;
      const fontSize = BASE_FONT_SIZE * 0.3;
      const angle =
        startAngle +
        calculateValueAngle(
          (gaugeSegmentDatum.max + gaugeSegmentDatum.min) / 2,
          minValue,
          maxValue,
        );
      const position: Position = calculatePosition(fontSize, angle);

      function calculateLabelTextAnchor(angle: number): TextAnchor {
        const normalizedMinAngle = normalizeAngle(angle);

        if (
          isBetweenAngle(
            normalizedMinAngle,
            1.5 * Math.PI,
            normalizeAngle(toRadian(-THRESHOLD_ANGLE_DEGREE)),
          )
        ) {
          return "end";
        }

        if (
          isBetweenAngle(
            normalizedMinAngle,
            normalizeAngle(toRadian(-THRESHOLD_ANGLE_DEGREE)),
            normalizeAngle(toRadian(THRESHOLD_ANGLE_DEGREE)),
          )
        ) {
          return "middle";
        }

        return "start";
      }

      return {
        color: getColor("text-dark"),
        position: position,
        textAnchor: calculateLabelTextAnchor(angle),
        value: gaugeSegmentLabel,
      };
    });

  const gaugeLabels = gaugeSegmentMinMaxLabels.concat(gaugeSegmentLabels);
  return (
    <svg width={WIDTH} height={HEIGHT}>
      <Group
        transform={`scale(${calculateChartScale(gaugeLabels)})`}
        transform-origin="center"
      >
        <Group top={centerY} left={centerX}>
          <Pie
            data={gaugeSegmentData}
            outerRadius={gaugeOuterRadius}
            innerRadius={gaugeInnerRadius}
            pieValue={gaugeAccessor}
            pieSort={gaugeSorter}
            fill={colorGetter}
            startAngle={startAngle}
            endAngle={endAngle}
          />
          <GaugeNeedle
            color={getColor("text-medium")}
            outlineColor={outlineColor}
            position={valuePosition}
            valueAngle={valueAngle}
          />
          {gaugeLabels.map(({ color, position, textAnchor, value }, index) => {
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
          })}
          <GaugeLabel
            fill={getColor("text-dark")}
            stroke={outlineColor}
            fontSize={dynamicValueFontSize}
            position={[0, -gaugeInnerRadius / 3]}
            label={displayValue}
          />
        </Group>
      </Group>
    </svg>
  );
}

interface GaugeLabelProps {
  fill: string;
  stroke: string;
  fontSize: number;
  position: Position;
  label: string;
  textAnchor?: TextAnchor;
}

const CIRCLE_ANGLE = Math.PI * 2;
/**
 * @returns angle in positive radian
 */
function normalizeAngle(angle: number) {
  const maybeNegativeAngle = angle % CIRCLE_ANGLE;
  return (maybeNegativeAngle + CIRCLE_ANGLE) % CIRCLE_ANGLE;
}

function calculateValueAngle(
  value: number,
  minValue: number,
  maxValue: number,
) {
  return toRadian(((value - minValue) / (maxValue - minValue)) * ARC_DEGREE);
}

function GaugeLabel({
  fill,
  stroke,
  fontSize,
  position,
  label,
  textAnchor = "middle",
}: GaugeLabelProps) {
  return (
    <OutlinedText
      fill={fill}
      fontWeight={700}
      fontSize={fontSize}
      stroke={stroke}
      strokeWidth={fontSize / 6}
      x={position[0]}
      y={position[1]}
      textAnchor={textAnchor}
      verticalAnchor="middle"
    >
      {label}
    </OutlinedText>
  );
}

function calculateValueFontSize(
  displayValue: string,
  gaugeInnerRadius: number,
) {
  let dynamicValueFontSize = BASE_FONT_SIZE;
  while (
    measureText(displayValue, dynamicValueFontSize) >
    2 * gaugeInnerRadius - VALUE_MARGIN
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

function toRadian(degree: number) {
  return (degree / 360) * (2 * Math.PI);
}

function toDegree(radian: number) {
  return (radian / (2 * Math.PI)) * 360;
}

interface GaugeNeedleProps {
  color: string;
  outlineColor: string;
  position: Position;
  valueAngle: number;
}
const GAUGE_NEEDLE_RADIUS = GAUGE_THICKNESS / 6;
const GAUGE_OUTLINE_RADIUS = GAUGE_NEEDLE_RADIUS * 1.6;
function GaugeNeedle({
  color,
  outlineColor,
  position,
  valueAngle,
}: GaugeNeedleProps) {
  const HALF_EQUILATERAL_TRIANGLE_ANGLE = 60 / 2;
  const translationYOffset =
    GAUGE_NEEDLE_RADIUS * Math.tan(toRadian(HALF_EQUILATERAL_TRIANGLE_ANGLE));
  return (
    <g
      transform={`translate(0 ${-translationYOffset})
      rotate(${toDegree(valueAngle)} ${toSvgPositionString(position)})`}
    >
      <Triangle
        center={position}
        radius={GAUGE_OUTLINE_RADIUS}
        color={outlineColor}
      />
      <Triangle center={position} radius={GAUGE_NEEDLE_RADIUS} color={color} />
    </g>
  );
}
interface TriangleProps {
  center: Position;
  radius: number;
  color: string;
}
const TRIANGLE_ANGLE = 120;
function Triangle({ center, radius, color }: TriangleProps) {
  return (
    <path
      fill={color}
      d={`M ${toSvgPositionString(
        movePosition(
          center,
          getCirclePositionInSvgCoordinate(radius, 0 * TRIANGLE_ANGLE),
        ),
      )}
      L ${toSvgPositionString(
        movePosition(
          center,
          getCirclePositionInSvgCoordinate(
            radius,
            toRadian(1 * TRIANGLE_ANGLE),
          ),
        ),
      )}
      L ${toSvgPositionString(
        movePosition(
          center,
          getCirclePositionInSvgCoordinate(
            radius,
            toRadian(2 * TRIANGLE_ANGLE),
          ),
        ),
      )}
      Z`}
    />
  );
}

function getCirclePositionInSvgCoordinate(
  radius: number,
  angleRadian: number,
): Position {
  return [Math.sin(angleRadian) * radius, -Math.cos(angleRadian) * radius];
}

function toSvgPositionString(position?: Position) {
  if (position) {
    return `${position[0]}, ${position[1]}`;
  }

  return "";
}

function movePosition(origin: Position, difference: Position): Position {
  return [origin[0] + difference[0], origin[1] + difference[1]];
}

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
