import {
  ARROW_BASE,
  ARROW_HEIGHT,
  ARROW_STROKE_THICKNESS,
  INNER_RADIUS,
  getArrowFillColor,
  getArrowStrokeColor,
} from "./constants";
import { degrees } from "./utils";

interface Props {
  angle: number;
  isAnimated?: boolean;
}

export const GaugeNeedle = ({ angle, isAnimated = true }: Props) => (
  <g
    style={{
      transition: isAnimated ? "transform 1.5s ease-in-out" : undefined,
    }}
    transform={`rotate(${degrees(angle)})`}
  >
    <path
      d={`M-${ARROW_BASE} 0 L0 -${ARROW_HEIGHT} L${ARROW_BASE} 0 Z`}
      fill={getArrowFillColor()}
      stroke={getArrowStrokeColor()}
      strokeWidth={ARROW_STROKE_THICKNESS}
      style={{
        transition: isAnimated ? "transform 1.5s ease-in-out" : undefined,
      }}
      transform={`translate(0,-${INNER_RADIUS})`}
    />
  </g>
);
