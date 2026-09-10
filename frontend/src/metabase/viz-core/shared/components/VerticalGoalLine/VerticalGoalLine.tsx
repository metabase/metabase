import { Line } from "@visx/shape";
import { Text } from "@visx/text";

import type { GoalStyle } from "../../types/style";

interface VerticalGoalLineProps {
  x: number;
  height: number;
  label: string;
  position: "left" | "right";
  style: GoalStyle;
}

export const VerticalGoalLine = ({
  x,
  height,
  label,
  style,
  position = "right",
}: VerticalGoalLineProps) => {
  const textAnchor = position === "right" ? "start" : "end";

  return (
    <g role="graphics-symbol" aria-roledescription="goal line">
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
      <Line
        strokeDasharray={4}
        stroke={style.lineStroke}
        strokeWidth={2}
        y1={0}
        y2={height}
        x1={x}
        x2={x}
      />
    </g>
  );
};
