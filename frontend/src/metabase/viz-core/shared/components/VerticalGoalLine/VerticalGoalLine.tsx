import { Line } from "@visx/shape";
import { Text } from "@visx/text";
import type { ReactNode } from "react";

import type { GoalStyle } from "../../types/style";

const LABEL_OFFSET_EM = 0.2;
const ADORNMENT_GAP = 4;

interface VerticalGoalLineProps {
  x: number;
  height: number;
  label: string;
  labelWidth: number;
  position: "left" | "right";
  style: GoalStyle;
  adornment?: ReactNode;
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
  // a square as tall as the label, on its outer side
  const adornmentSize = style.label.size;
  const adornmentX =
    position === "right"
      ? x + labelWidth + ADORNMENT_GAP
      : x - labelWidth - ADORNMENT_GAP - adornmentSize;

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
          x={adornmentX}
          y={-(1 + LABEL_OFFSET_EM) * adornmentSize}
          width={adornmentSize}
          height={adornmentSize}
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
            {adornment}
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
