import { Line } from "@visx/shape";
import { Text } from "@visx/text";
import type { ReactNode } from "react";

import {
  GOAL_WARNING_GAP,
  GOAL_WARNING_ICON_SIZE,
  GOAL_WARNING_WIDTH,
} from "../../../lib/goal-warning";
import type { GoalStyle } from "../../types/style";

import { GOAL_LABEL_OFFSET_EM, getGoalWarningY } from "./goal-warning";

interface VerticalGoalLineProps {
  x: number;
  height: number;
  label: string;
  labelWidth: number;
  position: "left" | "right";
  style: GoalStyle;
  warning?: ReactNode;
}

export const VerticalGoalLine = ({
  x,
  height,
  label,
  labelWidth,
  style,
  position = "right",
  warning,
}: VerticalGoalLineProps) => {
  const textAnchor = position === "right" ? "start" : "end";

  return (
    <g role="graphics-symbol" aria-roledescription="goal line">
      <Text
        y={0}
        textAnchor={textAnchor}
        verticalAnchor="end"
        dy={`-${GOAL_LABEL_OFFSET_EM}em`}
        x={x}
        fill={style.label.color}
        fontSize={style.label.size}
        fontWeight={style.label.weight}
      >
        {label}
      </Text>
      {warning != null && (
        <foreignObject
          x={
            position === "right"
              ? x + labelWidth + GOAL_WARNING_GAP
              : x - labelWidth - GOAL_WARNING_WIDTH
          }
          y={getGoalWarningY(style.label.size)}
          width={GOAL_WARNING_ICON_SIZE}
          height={GOAL_WARNING_ICON_SIZE}
        >
          {warning}
        </foreignObject>
      )}
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
