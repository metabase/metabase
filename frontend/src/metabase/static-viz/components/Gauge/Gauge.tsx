import React from "react";

import { Pie } from "@visx/shape";
import { Group } from "@visx/group";
import type { PieArcDatum } from "@visx/shape/lib/shapes/Pie";

type ObjectLiteral = Record<string, any>;
type GaugeDatum = [number, number, string];
type Position = [x: number, y: number];

interface GaugeSegment {
  min: number;
  max: number;
  color: string;
  label: string;
}
type GaugeData = GaugeDatum[];
interface GaugeVisualizationSettings {
  "gauge.segments": GaugeSegment[];
}

interface Card {
  visualization_settings: GaugeVisualizationSettings;
}

interface GaugeProps {
  card: Card;
  // TODO: Fix types
  data: ObjectLiteral;
}

const ARC_DEGREE = 180;
const MARGIN = 20;
const WIDTH = 500;
const HEIGHT = WIDTH / 2 - MARGIN + 2 * MARGIN;
const GAUGE_THICKNESS = 70;

export default function Gauge({ card, data }: GaugeProps) {
  const settings = card.visualization_settings;
  const gaugeData: GaugeData = settings["gauge.segments"].map(segment => [
    segment.min,
    segment.max,
    segment.color,
  ]);
  const centerX = WIDTH / 2;
  const centerY = WIDTH / 2;
  const gaugeOuterRadius = WIDTH / 2 - MARGIN;
  const gaugeInnerRadius = gaugeOuterRadius - GAUGE_THICKNESS;
  const startAngle = Math.PI + toRadian((360 - ARC_DEGREE) / 2);
  const endAngle = startAngle + toRadian(ARC_DEGREE);

  const minValue = gaugeData[0][0];
  const maxValue = gaugeData[gaugeData.length - 1][1];
  const value = data.rows[0][0];
  const valueAngle =
    startAngle +
    toRadian(((value - minValue) / (maxValue - minValue)) * ARC_DEGREE);

  const valuePosition = movePosition(
    [centerX, centerY],
    getCirclePositionInSvgCoordinate(gaugeInnerRadius, valueAngle),
  );
  return (
    <svg width={WIDTH} height={HEIGHT}>
      <Group top={centerY} left={centerX}>
        <Pie
          data={gaugeData}
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
    </svg>
  );
}

function gaugeAccessor(datum: GaugeDatum) {
  return datum[1] - datum[0];
}

function gaugeSorter(thisGaugeData: GaugeDatum, thatGaugeData: GaugeDatum) {
  return thisGaugeData[0] - thatGaugeData[0];
}

function colorGetter(pieArcDatum: PieArcDatum<GaugeDatum>) {
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
const GAUGE_RADIUS = GAUGE_THICKNESS / 6;
const GAUGE_OUTLINE_RADIUS = GAUGE_RADIUS * 1.6;
function GaugeNeedle({ position, valueAngle }: GaugeNeedleProps) {
  const translationYOffset = GAUGE_RADIUS * Math.tan(toRadian(30));
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
        radius={GAUGE_RADIUS}
        // TODO: Fix hard-coded color
        color="#D9D9D9"
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
