import { Line } from "@visx/shape";
import { Text } from "@visx/text";

import {
  GOAL_LINE_DASH,
  GOAL_LINE_WIDTH,
} from "../../../echarts/cartesian/option/goal-line";
import type { GoalStyle } from "../../types/style";

import { GoalLineMarker } from "./GoalLineMarker";

interface VerticalGoalLineProps {
  x: number;
  height: number;
  label: string;
  position: "left" | "right";
  style: GoalStyle;
  isStatic?: boolean;
  onMarkerMouseEnter?: (event: React.MouseEvent) => void;
  onMarkerMouseLeave?: (event: React.MouseEvent) => void;
}

export const VerticalGoalLine = ({
  x,
  height,
  label,
  style,
  position = "right",
  isStatic,
  onMarkerMouseEnter,
  onMarkerMouseLeave,
}: VerticalGoalLineProps) => {
  const textAnchor = position === "right" ? "start" : "end";

  return (
    <g role="graphics-symbol" aria-roledescription="goal line">
      <GoalLineStroke
        x={x + GOAL_LINE_WIDTH}
        height={height}
        stroke={style.lineShadowStroke}
      />
      <GoalLineStroke x={x} height={height} stroke={style.lineStroke} />
      {isStatic ? (
        <Text
          y={0}
          textAnchor={textAnchor}
          verticalAnchor="end"
          dy="-0.2em"
          x={x}
          fill={style.label.color}
          fontSize={style.label.size}
          fontWeight={style.label.weight}
        >
          {label}
        </Text>
      ) : (
        <GoalLineMarker
          x={x}
          y={0}
          style={style.marker}
          onMouseEnter={onMarkerMouseEnter}
          onMouseLeave={onMarkerMouseLeave}
        />
      )}
    </g>
  );
};

interface GoalLineStrokeProps {
  x: number;
  height: number;
  stroke: string;
}

const GoalLineStroke = ({ x, height, stroke }: GoalLineStrokeProps) => (
  <Line
    x1={x}
    x2={x}
    y1={0}
    y2={height}
    stroke={stroke}
    strokeWidth={GOAL_LINE_WIDTH}
    strokeDasharray={GOAL_LINE_DASH.join(",")}
    shapeRendering="crispEdges"
    pointerEvents="none"
  />
);
