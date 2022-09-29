import React, { ComponentProps } from "react";

import { Pie } from "@visx/shape";
import { Group } from "@visx/group";
import type { PieArcDatum } from "@visx/shape/lib/shapes/Pie";
import { formatNumber } from "metabase/static-viz/lib/numbers";
import { measureText } from "metabase/static-viz/lib/text";
import OutlinedText from "../Text/OutlinedText";

type GaugeSegmentDatum = [number, number, string, string];
type Position = [x: number, y: number];

interface GaugeSegment {
  min: number;
  max: number;
  color: string;
  label: string;
}
type GaugeSegmentData = GaugeSegmentDatum[];
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
}

type TextAnchor = ComponentProps<typeof OutlinedText>["textAnchor"];

const ARC_DEGREE = 180;
const HORIZONTAL_MARGIN = 20;
const VERTICAL_MARGIN = HORIZONTAL_MARGIN * 2;
const WIDTH = 540;
const VALUE_MARGIN = WIDTH * 0.1;
const GAUGE_RADIUS = WIDTH / 2 - HORIZONTAL_MARGIN;
const HEIGHT = GAUGE_RADIUS + 2 * VERTICAL_MARGIN;
const GAUGE_THICKNESS = 70;
const BASE_FONT_SIZE = GAUGE_THICKNESS * 0.8;

export default function Gauge({ card, data }: GaugeProps) {
  const settings = card.visualization_settings;
  const gaugeSegmentData: GaugeSegmentData = settings["gauge.segments"].map(
    segment => [segment.min, segment.max, segment.color, segment.label],
  );
  const centerX = WIDTH / 2;
  const centerY = GAUGE_RADIUS + VERTICAL_MARGIN;
  const gaugeOuterRadius = WIDTH / 2 - HORIZONTAL_MARGIN;
  const gaugeInnerRadius = gaugeOuterRadius - GAUGE_THICKNESS;
  const startAngle = Math.PI + toRadian((360 - ARC_DEGREE) / 2);
  const endAngle = startAngle + toRadian(ARC_DEGREE);

  const minValue = gaugeSegmentData[0][0];
  const maxValue = gaugeSegmentData[gaugeSegmentData.length - 1][1];
  const value = data.rows[0][0];
  const valueAngle =
    startAngle + calculateValueAngle(value, minValue, maxValue);

  const valuePosition = movePosition(
    [centerX, centerY],
    getCirclePositionInSvgCoordinate(gaugeInnerRadius, valueAngle),
  );
  const displayValue = formatNumber(value);
  const dynamicValueFontSize = calculateValueFontSize(
    displayValue,
    gaugeInnerRadius,
  );

  return (
    <svg width={WIDTH} height={HEIGHT}>
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
      </Group>
      <GaugeNeedle position={valuePosition} valueAngle={valueAngle} />
      {gaugeSegmentData.map((gaugeSegmentDatum, index) => {
        const fontSize = BASE_FONT_SIZE * 0.3;
        const isFirstSegment = index === 0;
        const isLastSegment = index === gaugeSegmentData.length - 1;
        const minAngle =
          startAngle +
          calculateValueAngle(gaugeSegmentDatum[0], minValue, maxValue);
        const minPosition: Position = isFirstSegment
          ? movePosition(
              [centerX, centerY],
              [-(gaugeInnerRadius + gaugeOuterRadius) / 2, fontSize],
            )
          : calculatePosition(minAngle);
        const maxPosition: Position | undefined = isLastSegment
          ? movePosition(
              [centerX, centerY],
              [(gaugeInnerRadius + gaugeOuterRadius) / 2, fontSize],
            )
          : undefined;

        function calculatePosition(angle: number) {
          return movePosition(
            [centerX, centerY],
            getCirclePositionInSvgCoordinate(
              gaugeOuterRadius + fontSize,
              angle,
            ),
          );
        }

        function calculateLabelTextAnchor(angle: number): TextAnchor {
          const THRESHOLD_ANGLE_DEGREE = toRadian(30);
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
        return (
          <>
            (
            {minPosition && (
              <GaugeLabel
                key={index}
                // TODO: Fix hard-coded color
                fill="#949AAB"
                fontSize={fontSize}
                position={minPosition}
                label={formatNumber(gaugeSegmentDatum[0])}
                textAnchor={calculateLabelTextAnchor(minAngle)}
              />
            )}
            {maxPosition && (
              <GaugeLabel
                key={index}
                // TODO: Fix hard-coded color
                fill="#949AAB"
                fontSize={fontSize}
                position={maxPosition}
                label={formatNumber(gaugeSegmentDatum[1])}
              />
            )}
          </>
        );
      })}
      {gaugeSegmentData.map((gaugeSegmentDatum, index) => {
        const gaugeSegmentLabel = gaugeSegmentDatum[3];
        if (!gaugeSegmentLabel) {
          return null;
        }
        const fontSize = BASE_FONT_SIZE * 0.3;
        const angle =
          startAngle +
          calculateValueAngle(
            (gaugeSegmentDatum[1] + gaugeSegmentDatum[0]) / 2,
            minValue,
            maxValue,
          );
        const position: Position = calculatePosition(angle);

        function calculatePosition(angle: number) {
          return movePosition(
            [centerX, centerY],
            getCirclePositionInSvgCoordinate(
              gaugeOuterRadius + fontSize,
              angle,
            ),
          );
        }

        function calculateLabelTextAnchor(angle: number): TextAnchor {
          const THRESHOLD_ANGLE_DEGREE = toRadian(30);
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
        return (
          <GaugeLabel
            key={index}
            // TODO: Fix hard-coded color
            fill="#4c5773"
            fontSize={fontSize}
            position={position}
            label={gaugeSegmentLabel}
            textAnchor={calculateLabelTextAnchor(angle)}
          />
        );
      })}
      <GaugeLabel
        // TODO: Fix hard-coded color
        fill="#4C5773"
        fontSize={dynamicValueFontSize}
        position={[centerX, centerY - gaugeInnerRadius / 3]}
        label={displayValue}
      />
    </svg>
  );
}

interface GaugeLabelProps {
  fill: string;
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
      stroke="white"
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

function gaugeAccessor(datum: GaugeSegmentDatum) {
  return datum[1] - datum[0];
}

function gaugeSorter(
  thisGaugeData: GaugeSegmentDatum,
  thatGaugeData: GaugeSegmentDatum,
) {
  return thisGaugeData[0] - thatGaugeData[0];
}

function colorGetter(pieArcDatum: PieArcDatum<GaugeSegmentDatum>) {
  return pieArcDatum.data[2];
}

function toRadian(degree: number) {
  return (degree / 360) * (2 * Math.PI);
}

function toDegree(radian: number) {
  return (radian / (2 * Math.PI)) * 360;
}

interface GaugeNeedleProps {
  position: Position;
  valueAngle: number;
}
const GAUGE_NEEDLE_RADIUS = GAUGE_THICKNESS / 6;
const GAUGE_OUTLINE_RADIUS = GAUGE_NEEDLE_RADIUS * 1.6;
function GaugeNeedle({ position, valueAngle }: GaugeNeedleProps) {
  const translationYOffset = GAUGE_NEEDLE_RADIUS * Math.tan(toRadian(30));
  return (
    <g
      transform={`translate(0 ${-translationYOffset})
      rotate(${toDegree(valueAngle)} ${position[0]} ${position[1]})`}
    >
      <Triangle
        center={position}
        radius={GAUGE_OUTLINE_RADIUS}
        // TODO: Fix hard-coded color
        color="white"
      />
      <Triangle
        center={position}
        radius={GAUGE_NEEDLE_RADIUS}
        // TODO: Fix hard-coded color
        color="#949AAB"
      />
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
      d={`M ${toPosition(
        movePosition(
          center,
          getCirclePositionInSvgCoordinate(radius, 0 * TRIANGLE_ANGLE),
        ),
      )}
      L ${toPosition(
        movePosition(
          center,
          getCirclePositionInSvgCoordinate(
            radius,
            toRadian(1 * TRIANGLE_ANGLE),
          ),
        ),
      )}
      L ${toPosition(
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

function toPosition(position?: Position) {
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
