import React from "react";
import { Line } from "@visx/shape";
import { Text } from "@visx/text";
import { ChartTheme } from "metabase/visualizations/types/theme";

interface VerticalGoalLineProps {
  x: number;
  height: number;
  label: string;
  style: ChartTheme["goal"];
}

export const VerticalGoalLine = ({
  x,
  height,
  label,
  style,
}: VerticalGoalLineProps) => {
  return (
    <>
      <Text
        y={0}
        textAnchor="start"
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
    </>
  );
};
