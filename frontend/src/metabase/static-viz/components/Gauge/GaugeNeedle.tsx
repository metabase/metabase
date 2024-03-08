import type { Position } from "./types";
import { getCirclePositionInSvgCoordinate } from "./utils";

interface GaugeNeedleProps {
  color: string;
  outlineColor: string;
  position: Position;
  valueAngle: number;
}

const CIRCLE_ANGLE = 2 * Math.PI;
const GAUGE_NEEDLE_RADIUS = 14;
const GAUGE_NEEDLE_OUTLINE_RADIUS = GAUGE_NEEDLE_RADIUS * 1.4;
const EQUILATERAL_TRIANGLE_ANGLE = CIRCLE_ANGLE / 6;

// Draw equilateral triangle within a circle with radius = `GAUGE_NEEDLE_RADIUS`,
// that's why I name some variables with `_RADIUS` prefix even though I'm drawing a triangle.
// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function GaugeNeedle({
  color,
  outlineColor,
  position,
  valueAngle,
}: GaugeNeedleProps) {
  const translationYOffset =
    GAUGE_NEEDLE_RADIUS * Math.tan(EQUILATERAL_TRIANGLE_ANGLE / 2);
  return (
    <g
      transform={`rotate(${toDegree(valueAngle)} ${toSvgPositionString(
        position,
      )}) translate(0 ${-translationYOffset})`}
    >
      <Triangle
        center={position}
        radius={GAUGE_NEEDLE_OUTLINE_RADIUS}
        color={outlineColor}
      />
      <Triangle center={position} radius={GAUGE_NEEDLE_RADIUS} color={color} />
    </g>
  );
}

function toDegree(radian: number) {
  return (radian / CIRCLE_ANGLE) * 360;
}

interface TriangleProps {
  center: Position;
  radius: number;
  color: string;
}

const TRIANGLE_ANGLE = CIRCLE_ANGLE / 3;
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
          getCirclePositionInSvgCoordinate(radius, 1 * TRIANGLE_ANGLE),
        ),
      )}
      L ${toSvgPositionString(
        movePosition(
          center,
          getCirclePositionInSvgCoordinate(radius, 2 * TRIANGLE_ANGLE),
        ),
      )}
      Z`}
    />
  );
}

function toSvgPositionString(position: Position) {
  return `${position[0]} ${position[1]}`;
}

function movePosition(origin: Position, difference: Position): Position {
  return [origin[0] + difference[0], origin[1] + difference[1]];
}
