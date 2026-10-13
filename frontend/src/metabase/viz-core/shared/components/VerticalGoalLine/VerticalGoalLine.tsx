import { Line } from "@visx/shape";
import { Text } from "@visx/text";

import type { GoalStyle } from "../../types/style";

import { GOAL_ADORNMENT_GAP, type GoalAdornment } from "./adornment";

const LABEL_OFFSET_EM = 0.2;

interface VerticalGoalLineProps {
  x: number;
  height: number;
  label: string;
  labelWidth: number;
  position: "left" | "right";
  style: GoalStyle;
  adornment?: GoalAdornment;
}

export const VerticalGoalLine = ({
  x,
  height,
  label,
  labelWidth,
  style,
  position = "right",
  adornment,
}: VerticalGoalLineProps) => {
  const textAnchor = position === "right" ? "start" : "end";
  const labelSize = style.label.size;

  return (
    <g role="graphics-symbol" aria-roledescription="goal line">
      <Text
        y={0}
        textAnchor={textAnchor}
        verticalAnchor="end"
        dy={`-${LABEL_OFFSET_EM}em`}
        x={x}
        fill={style.label.color}
        fontSize={style.label.size}
        fontWeight={style.label.weight}
      >
        {label}
      </Text>
      {adornment != null && (
        <foreignObject
          x={
            position === "right"
              ? x + labelWidth + GOAL_ADORNMENT_GAP
              : x - labelWidth - GOAL_ADORNMENT_GAP - adornment.size
          }
          y={-(1 + LABEL_OFFSET_EM) * labelSize}
          width={adornment.size}
          height={labelSize}
          overflow="visible"
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
            }}
          >
            {adornment.content}
          </div>
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
